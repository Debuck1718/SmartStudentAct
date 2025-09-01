const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "your-super-secret-refresh-key";

const isProd = process.env.NODE_ENV === "production";

// --- Public Routes ---
const PUBLIC_ROUTES = [
  "/users/login",
  "/users/signup",
  "/users/verify-otp",
  "/users/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
];

const isPublicRoute = (url) => {
  const cleanUrl = url.split("?")[0];
  return PUBLIC_ROUTES.some(
    (route) => cleanUrl === route || cleanUrl === route.replace("/api", "")
  );
};

// --- Token Helpers ---
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
}

function setAccessTokenCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    domain: isProd ? ".smartstudentact.com" : undefined,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
}

// --- Middleware ---
const authenticateJWT = (req, res, next) => {
  if (isPublicRoute(req.originalUrl)) {
    return next();
  }

  let token = req.cookies?.access_token;

  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    logger.warn("JWT missing for route:", req.originalUrl);
    return res.status(401).json({
      status: false,
      message: "Authentication token missing.",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      // --- Token expired ---
      if (err.name === "TokenExpiredError") {
        const refreshToken = req.cookies?.refresh_token;
        if (!refreshToken) {
          logger.warn("Access token expired, no refresh token found");
          return res.status(401).json({
            status: false,
            message: "Session expired. Please login again.",
          });
        }

        return jwt.verify(refreshToken, JWT_REFRESH_SECRET, (refreshErr, refreshDecoded) => {
          if (refreshErr) {
            logger.error("Refresh token invalid/expired:", refreshErr.message);
            return res.status(403).json({
              status: false,
              message: "Refresh token expired or invalid. Please login again.",
            });
          }

          // issue new access token
          const newAccessToken = generateAccessToken({
            id: refreshDecoded.id,
            role: refreshDecoded.role,
            email: refreshDecoded.email,
          });

          setAccessTokenCookie(res, newAccessToken);

          req.userId = refreshDecoded.id;
          req.userRole = refreshDecoded.role;
          req.email = refreshDecoded.email;
          req.user = refreshDecoded;

          logger.info("New access token issued via refresh token");
          return next();
        });
      }

      // --- Other JWT error ---
      logger.error("JWT verification failed:", err.message);
      return res.status(403).json({
        status: false,
        message: "Token expired or invalid.",
      });
    }

    // --- Token OK ---
    req.userId = decoded.id || decoded.userId;
    req.userRole = decoded.role;
    req.email = decoded.email;
    req.user = decoded;

    next();
  });
};

// --- Role Guard ---
const requireAdmin = (req, res, next) => {
  if (
    req.userRole !== "admin" &&
    req.userRole !== "overseer" &&
    req.userRole !== "global_overseer"
  ) {
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
  generateAccessToken,
  setAccessTokenCookie,
};
