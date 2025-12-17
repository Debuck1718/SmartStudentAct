/// middlewares/auth.js
console.log("🟢 AUTH.JS LOADED");

import jwt from "jsonwebtoken";
import User from "../models/User.js";

const isProd = process.env.NODE_ENV === "production";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

const getJWTSecret = () => process.env.JWT_SECRET || "dev-jwt-secret";
const getJWTRefreshSecret = () =>
  process.env.JWT_REFRESH_SECRET || "dev-jwt-refresh-secret";

/**
 * 🚨 IMPORTANT
 * /auth/check MUST NOT be public
 */
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

export const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    getJWTSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

export const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    getJWTRefreshSecret(),
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

export const setAuthCookies = (res, accessToken, refreshToken) => {
  const options = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    path: "/",
    ...(isProd ? { domain: ".smartstudentact.com" } : {}),
  };

  res.cookie("access_token", accessToken, {
    ...options,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", refreshToken, {
    ...options,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const authenticateJWT = async (req, res, next) => {
  if (isPublicRoute(req.originalUrl)) return next();

  // 🔍 DEBUG
  console.log("🔍 AUTH CHECK:", {
    url: req.originalUrl,
    cookiesPresent: !!req.cookies,
    accessToken: !!req.cookies?.access_token,
    refreshToken: !!req.cookies?.refresh_token,
  });

  let token =
    req.cookies?.access_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) {
    return res.status(401).json({
      status: false,
      message: "Authentication token missing.",
    });
  }

  try {
    const decoded = jwt.verify(token, getJWTSecret());

    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.email = decoded.email;
    req.user = decoded;

    return next();
  } catch (err) {
    if (err.name !== "TokenExpiredError") {
      return res.status(403).json({
        status: false,
        message: "Invalid token.",
      });
    }

    // 🔁 HANDLE REFRESH
    const refreshToken =
      req.cookies?.refresh_token || req.headers["x-refresh-token"];

    if (!refreshToken) {
      return res.status(401).json({
        status: false,
        message: "Session expired. Please login again.",
      });
    }

    try {
      const refreshDecoded = jwt.verify(
        refreshToken,
        getJWTRefreshSecret()
      );

      const user = await User.findById(refreshDecoded.id);
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(403).json({
          status: false,
          message: "Invalid session.",
        });
      }

      const newAccessToken = generateAccessToken(user);
      setAuthCookies(res, newAccessToken, refreshToken);

      req.userId = user._id;
      req.userRole = user.role;
      req.email = user.email;
      req.user = user;

      return next();
    } catch {
      return res.status(403).json({
        status: false,
        message: "Refresh token expired.",
      });
    }
  }
};

export const requireAdmin = (req, res, next) => {
  const roles = ["admin", "overseer", "global_overseer"];
  if (!roles.includes(req.userRole)) {
    return res.status(403).json({
      status: false,
      message: "Not authorised.",
    });
  }
  next();
};
