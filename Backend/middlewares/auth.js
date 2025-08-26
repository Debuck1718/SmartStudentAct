// smartstudent-backend/middlewares/auth.js
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";

// ✅ Routes that don’t require authentication
const PUBLIC_ROUTES = [
  "/api/users/login",
  "/api/users/signup",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
];

/**
 * Normalize the URL so PUBLIC_ROUTES match with or without `/api` prefix
 */
const isPublicRoute = (url) => {
  const cleanUrl = url.split("?")[0]; // strip query params
  return PUBLIC_ROUTES.some(
    (route) => cleanUrl === route || cleanUrl === route.replace("/api", "")
  );
};

/**
 * Middleware to authenticate user via JWT.
 * ✅ Supports token in cookies (preferred) OR Authorization header.
 */
const authenticateJWT = (req, res, next) => {
  if (isPublicRoute(req.originalUrl)) {
    return next();
  }

  // ✅ Try cookies first
  let token = req.cookies?.access_token;

  // ✅ Fallback: Authorization header (Bearer <token>)
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      status: false,
      message: "Authentication token missing.",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .json({ status: false, message: "Token expired or invalid." });
    }

    // Attach user info to request
    // The role from the JWT token is now the source of truth for permissions.
    req.userId = decoded.userId || decoded.id;
    req.userRole = decoded.role;
    req.email = decoded.email;
    req.user = decoded;

    next();
  });
};

/**
 * Middleware to enforce admin-only access
 */
const requireAdmin = (req, res, next) => {
  // 🚩 UPDATED: Now checks if the user's role is admin, overseer, or global-overseer,
  // making it compatible with the new roles defined in the User schema.
  if (req.userRole !== "admin" && req.userRole !== "overseer" && req.userRole !== "global-overseer") {
    return res.status(403).json({
      status: false,
      message:
        "Sorry, you are not authorised to view this resource. Contact your administrator.",
    });
  }
  next();
};

module.exports = {
  authenticateJWT,
  requireAdmin,
};
