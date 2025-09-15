const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error("JWT_SECRET and JWT_REFRESH_SECRET must be set in the environment variables.");
}

const isProd = process.env.NODE_ENV === "production";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

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

function generateAccessToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY
    }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY
    }
  );
}

function setAuthCookies(res, accessToken, refreshToken) {
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: "None",
    domain: ".smartstudentact.com",
    path: "/",
  };

  res.cookie("access_token", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

const authenticateJWT = (req, res, next) => {
  if (isPublicRoute(req.originalUrl)) {
    return next();
  }

  let token = req.cookies?.access_token;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
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
      if (err.name === "TokenExpiredError") {
        const refreshToken = req.cookies?.refresh_token;

        if (!refreshToken) {
          logger.warn("Access token expired, no refresh token found.");
          return res.status(401).json({
            status: false,
            message: "Session expired. Please login again.",
          });
        }
        
        return jwt.verify(refreshToken, JWT_REFRESH_SECRET, async (refreshErr, refreshDecoded) => {
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

          res.cookie("access_token", newAccessToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: "None",
            domain: ".smartstudentact.com",
            path: "/",
            maxAge: 15 * 60 * 1000,
          });

          req.userId = user._id; 
          req.userRole = user.role;
          req.email = user.email;
          req.user = user;

          logger.info("New access token issued via refresh token.");
          return next();
        });

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

const requireAdmin = (req, res, next) => {
  const adminRoles = ["admin", "overseer", "global_overseer"];
  if (!req.userRole || !adminRoles.includes(req.userRole)) {
    return res.status(403).json({
      status: false,
      message: "Sorry, you are not authorised to view this resource. Contact your administrator.",
    });
  }
  next();
};

module.exports = {
  authenticateJWT,
  requireAdmin,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
};

