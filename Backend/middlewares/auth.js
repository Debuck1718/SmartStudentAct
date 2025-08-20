// smartstudent-backend/middlewares/auth.js

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// List of routes that do NOT need authentication
const PUBLIC_ROUTES = [
    '/api/users/login',
    '/api/users/signup',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
];

/**
 * Middleware to authenticate a user using a JSON Web Token.
 * It checks for a token in the 'Authorization' header and verifies it.
 * If successful, it attaches the user payload to the request object.
 * Assumes the token payload contains 'userId' and 'role'.
 */
const authenticateJWT = (req, res, next) => {
    // Skip authentication for whitelisted routes
    if (PUBLIC_ROUTES.includes(req.path)) {
        return next();
    }

    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1];

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({ message: 'Invalid or expired token.' });
            }
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ message: 'Authentication token missing.' });
    }
};

/**
 * Middleware factory to check if a user has a specific role.
 * This middleware should be used after authenticateJWT.
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
            logger.warn(
                `Access denied for user ${req.user.userId}. Required role: ${requiredRole}, User role: ${req.user.role}`
            );
            res.status(403).json({ message: 'You do not have the required permissions to access this resource.' });
        }
    };
};

module.exports = {
    authenticateJWT,
    hasRole,
};

