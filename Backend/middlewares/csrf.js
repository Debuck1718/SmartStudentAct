// middleware/csrf.js
const crypto = require("crypto");

// 🚫 Routes that skip CSRF validation (supports /api/ prefix too)
const CSRF_EXEMPT = [
  "/users/login",
  "/users/signup",
  "/users/verify-otp",
  "/auth/forgot-password",
  "/auth/reset-password",
];

function isExempt(path) {
  return CSRF_EXEMPT.some(route => path.endsWith(route));
}

module.exports = function csrfProtection(req, res, next) {
  try {
    // 1. Ensure session has a CSRF token
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }

    const sessionToken = req.session.csrfToken;
    const csrfHeader = req.headers["x-csrf-token"];

    // 2. Skip CSRF check for exempt routes
    if (!isExempt(req.path)) {
      const methodNeedsCheck = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);

      if (methodNeedsCheck) {
        if (!csrfHeader) {
          console.warn(`[CSRF] Missing token for ${req.method} ${req.originalUrl} from IP ${req.ip}`);
          return res.status(403).json({ error: "CSRF token missing" });
        }

        if (csrfHeader !== sessionToken) {
          console.warn(`[CSRF] Invalid token for ${req.method} ${req.originalUrl} from IP ${req.ip}`);
          return res.status(403).json({ error: "Invalid CSRF token" });
        }
      }
    }

    // 3. Inject current CSRF token into all JSON responses
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (typeof body === "object" && body !== null) {
        body.csrfToken = req.session.csrfToken; // always latest session token
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    console.error("❌ CSRF middleware error:", err);
    return res.status(500).json({ error: "CSRF validation failed" });
  }
};
