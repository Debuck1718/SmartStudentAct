// smartstudent-backend/middlewares/auth.js

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// This is a placeholder for your actual JWT secret.
// In a real application, you should use an environment variable.
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

/**
 * Middleware to authenticate a user using a JSON Web Token.
 * It checks for a token in the 'Authorization' header and verifies it.
 * If successful, it attaches the user payload to the request object.
 * Assumes the token payload contains 'userId' and 'role'.
 *
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The next middleware function.
 */
const authenticateJWT = (req, res, next) => {
    // Check for the Authorization header
    const authHeader = req.headers.authorization;

    if (authHeader) {
        // Extract the token (Bearer TOKEN)
        const token = authHeader.split(' ')[1];

        // Verify the token
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                // Return a 403 Forbidden error if the token is invalid or expired
                return res.status(403).json({ message: 'Invalid or expired token.' });
            }
            // Attach the user information from the token payload to the request object
            req.user = user;
            next();
        });
    } else {
        // Return a 401 Unauthorized error if no token is provided
        res.status(401).json({ message: 'Authentication token missing.' });
    }
};


/**
 * Middleware factory to check if a user has a specific role.
 * This middleware should be used after authenticateJWT.
 *
 * @param {string} requiredRole - The role to check for (e.g., 'teacher', 'student').
 * @returns {Function} An Express middleware function.
 */
const hasRole = (requiredRole) => {
    return (req, res, next) => {
        // Check if the user object was attached by authenticateJWT
        if (!req.user) {
            logger.error('hasRole middleware used without authenticateJWT.');
            return res.status(500).json({ message: 'Authentication not processed.' });
        }

        // Check if the user's role matches the required role
        if (req.user.role === requiredRole) {
            // Role matches, proceed to the next middleware/route handler
            next();
        } else {
            // Role does not match, return a 403 Forbidden error
            logger.warn(`Access denied for user ${req.user.userId}. Required role: ${requiredRole}, User role: ${req.user.role}`);
            res.status(403).json({ message: 'You do not have the required permissions to access this resource.' });
        }
    };
};


module.exports = {
    authenticateJWT,
    hasRole,
};
