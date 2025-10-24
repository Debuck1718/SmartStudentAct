// middlewares/auth.js
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";
import User from "../models/User.js";

const isProd = process.env.NODE_ENV === "production";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

const getEnvOrThrow = (key) => {
  const value = process.env[key];
  if (!value) logger.warn(`⚠️ Missing environment variable: ${key}`);
  return value;
};

const JWT_SECRET = getEnvOrThrow("JWT_SECRET");
const JWT_REFRESH_SECRET = getEnvOrThrow("JWT_REFRESH_SECRET");

const PUBLIC_ROUTES = [
  "/users/login",
  "/users/signup",
  "/users/verify-otp",
  "/users/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/contact",
];

const isPublicRoute = (url) => {
  const cleanUrl = url.split("?")[0];
  return PUBLIC_ROUTES.some((route) => cleanUrl.startsWith(route));
};

// ---------- TOKEN HELPERS ----------
export const generateAccessToken = (user) => {
  if (!JWT_SECRET) throw new Error("Server misconfiguration: missing JWT_SECRET");
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

export const generateRefreshToken = (user) => {
  if (!JWT_REFRESH_SECRET) throw new Error("Server misconfiguration: missing JWT_REFRESH_SECRET");
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

// ---------- COOKIE SETUP ----------
export const setAuthCookies = (res, accessToken, refreshToken) => {
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: "None",
    domain: isProd ? ".smartstudentact.com" : undefined, // only set domain in production
    path: "/",
  };

  res.cookie("access_token", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000, // 15 min
  });

  res.cookie("refresh_token", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// ---------- AUTH MIDDLEWARE ----------
export const authenticateJWT = (req, res, next) => {
  if (isPublicRoute(req.originalUrl)) return next();

  let token = req.cookies?.access_token;

  // allow mobile Authorization header
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") token = parts[1];
  }

  if (!token) {
    logger.warn(`Authentication token missing for route: ${req.originalUrl}`);
    return res.status(401).json({
      status: false,
      message: "Authentication token missing.",
    });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      // Handle expired token using refresh token
      if (err.name === "TokenExpiredError") {
        const refreshToken =
          req.cookies?.refresh_token || req.headers["x-refresh-token"];

        if (!refreshToken) {
          return res.status(401).json({
            status: false,
            message: "Session expired. Please login again.",
          });
        }

        jwt.verify(refreshToken, JWT_REFRESH_SECRET, async (refreshErr, refreshDecoded) => {
          if (refreshErr) {
            logger.error(`Refresh token invalid/expired: ${refreshErr.message}`);
            return res.status(403).json({
              status: false,
              message: "Refresh token expired or invalid. Please login again.",
            });
          }

          const user = await User.findById(refreshDecoded.id);
          if (!user || user.refreshToken !== refreshToken) {
            logger.warn(`Refresh token mismatch for user ${refreshDecoded.id}.`);
            return res.status(403).json({
              status: false,
              message: "Invalid session. Please login again.",
            });
          }

          const newAccessToken = generateAccessToken(user);
          setAuthCookies(res, newAccessToken, refreshToken);
          res.setHeader("x-access-token", newAccessToken);

          req.userId = user._id;
          req.userRole = user.role;
          req.email = user.email;
          req.user = user;

          logger.info("✅ New access token issued via refresh token.");
          return next();
        });
        return;
      }

      logger.error(`JWT verification failed: ${err.message}`);
      return res.status(403).json({
        status: false,
        message: "Invalid token.",
      });
    }

    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.email = decoded.email;
    req.user = decoded;
    next();
  });
};

// ---------- ADMIN GUARD ----------
export const requireAdmin = (req, res, next) => {
  const adminRoles = ["admin", "overseer", "global_overseer"];
  if (!req.userRole || !adminRoles.includes(req.userRole)) {
    return res.status(403).json({
      status: false,
      message:
        "Sorry, you are not authorised to view this resource. Contact your administrator.",
    });
  }
  next();
};

