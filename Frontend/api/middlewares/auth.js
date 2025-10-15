import jwt from "jsonwebtoken";
import logger from "../../utils/logger.js";
import models from "../models/index.js";

const { User } = models;

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be set in env.");
}

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const isProd = process.env.NODE_ENV === "production";

// ✅ Public routes (no authentication required)
const PUBLIC_ROUTES = [
  "/api/users/login",
  "/api/users/signup",
  "/api/users/verify-otp",
  "/api/users/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/contact",
];

const isPublicRoute = (url) => {
  const cleanUrl = url.split("?")[0];
  return PUBLIC_ROUTES.some((route) => cleanUrl.startsWith(route));
};

// ✅ Token helpers
export const generateAccessToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

export const generateRefreshToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

// ✅ Authentication middleware-like helper
export const authenticateJWT = async (req, res) => {
  if (isPublicRoute(req.url)) {
    return { user: null, public: true };
  }

  try {
    let token = null;

    // Try reading from cookies (web)
    const cookies = req.headers.cookie
      ? Object.fromEntries(
          req.headers.cookie.split(";").map((c) => c.trim().split("="))
        )
      : {};

    if (cookies.access_token) token = cookies.access_token;

    // Try reading from Authorization header (mobile)
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") token = parts[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Authentication token missing." });
    }

    // Verify access token
    return new Promise((resolve) => {
      jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
          // Handle token expired
          if (err.name === "TokenExpiredError") {
            const refreshToken =
              cookies.refresh_token || req.headers["x-refresh-token"];

            if (!refreshToken) {
              return res.status(401).json({
                message: "Session expired. Please login again.",
              });
            }

            jwt.verify(
              refreshToken,
              JWT_REFRESH_SECRET,
              async (refreshErr, refreshDecoded) => {
                if (refreshErr) {
                  return res.status(403).json({
                    message: "Refresh token expired or invalid. Please login again.",
                  });
                }

                const user = await User.findById(refreshDecoded.id);
                if (!user || user.refreshToken !== refreshToken) {
                  return res.status(403).json({
                    message: "Invalid session. Please login again.",
                  });
                }

                const newAccessToken = generateAccessToken(user);
                res.setHeader("x-access-token", newAccessToken);
                resolve({ user });
              }
            );
            return;
          }

          return res.status(403).json({ message: "Invalid token." });
        }

        // Valid token
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ message: "User not found." });

        resolve({ user });
      });
    });
  } catch (error) {
    logger.error("JWT auth error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// ✅ Role guard for Vercel
export const requireAdmin = async (req, res, user) => {
  const adminRoles = ["admin", "overseer", "global_overseer"];
  if (!user || !adminRoles.includes(user.role)) {
    return res.status(403).json({
      message:
        "Sorry, you are not authorised to view this resource. Contact your administrator.",
    });
  }
  return true;
};
