// smartstudent-backend/middlewares/auth.js

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// ✅ Routes that don’t require authentication
const PUBLIC_ROUTES = [
    '/api/users/login',
    '/api/users/signup',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
];

/**
 * Normalize the URL so PUBLIC_ROUTES match with or without `/api` prefix
 */
const isPublicRoute = (url) => {
    const cleanUrl = url.split('?')[0]; // strip query params
    return PUBLIC_ROUTES.some((route) =>
        cleanUrl === route || cleanUrl === route.replace('/api', '')
    );
};

/**
 * Middleware to authenticate a user using a JWT.
 */
const authenticateJWT = (req, res, next) => {
    if (isPublicRoute(req.originalUrl)) {
        return next();
    }

    // 1. Check cookie first
    const token = req.cookies?.token;

    // 2. Fallback to Authorization header
    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.split(' ')[1];

    const jwtToken = token || headerToken;

    if (!jwtToken) {
        return res.status(401).json({ message: 'Authentication token missing.' });
    }

    jwt.verify(jwtToken, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
};

/**
 * Middleware factory to enforce role-based access control.
 */
const hasRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.user) {
            logger.error('hasRole middleware used without authenticateJWT.');
            return res.status(500).json({ message: 'Authentication not processed.' });
        }

        if (req.user.role === requiredRole) {
            next();
        } else {
            const identifier = req.user.email || req.user.id || req.user.userId;
            logger.warn(
                `Access denied for user ${identifier}. Required role: ${requiredRole}, User role: ${req.user.role}`
            );
            res.status(403).json({ message: 'You do not have the required permissions to access this resource.' });
        }
    };
};

module.exports = {
    authenticateJWT,
    hasRole,
};
