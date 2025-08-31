const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "your-super-secret-refresh-key";

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

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
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
    return res.status(401).json({
      status: false,
      message: "Authentication token missing.",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {

      if (err.name === "TokenExpiredError") {
        const refreshToken = req.cookies?.refresh_token;
        if (!refreshToken) {
          return res.status(401).json({
            status: false,
            message: "Session expired. Please login again.",
          });
        }

        return jwt.verify(refreshToken, JWT_REFRESH_SECRET, (refreshErr, refreshDecoded) => {
          if (refreshErr) {
            return res.status(403).json({
              status: false,
              message: "Refresh token expired or invalid. Please login again.",
            });
          }

          const newAccessToken = generateAccessToken({
            id: refreshDecoded.id,
            role: refreshDecoded.role,
            email: refreshDecoded.email,
          });

          res.cookie("access_token", newAccessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: 15 * 60 * 1000, 
          });

          req.userId = refreshDecoded.id;
          req.userRole = refreshDecoded.role;
          req.email = refreshDecoded.email;
          req.user = refreshDecoded;

          return next();
        });
      }

      return res.status(403).json({
        status: false,
        message: "Token expired or invalid.",
      });
    }

    req.userId = decoded.userId || decoded.id;
    req.userRole = decoded.role;
    req.email = decoded.email;
    req.user = decoded;

    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.userRole !== "admin" && req.userRole !== "overseer" && req.userRole !== "global_overseer") {
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
