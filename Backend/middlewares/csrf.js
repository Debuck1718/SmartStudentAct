// middleware/csrf.js
module.exports = function csrfProtection(req, res, next) {
    try {
        const csrfHeader = req.headers["x-csrf-token"];
        const sessionToken = req.session?.csrfToken;

        if (!csrfHeader || !sessionToken || csrfHeader !== sessionToken) {
            return res.status(403).json({ error: "Invalid or missing CSRF token" });
        }

        next();
    } catch (err) {
        console.error("❌ CSRF middleware error:", err);
        return res.status(500).json({ error: "CSRF validation failed" });
    }
};
