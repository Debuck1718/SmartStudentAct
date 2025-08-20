// smartstudent-backend/middlewares/auth.js

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Routes that don't need authentication
const PUBLIC_ROUTES = [
    '/api/users/login',
    '/api/users/signup',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
];

const authenticateJWT = (req, res, next) => {
    // Use originalUrl so it includes /api prefix
    if (PUBLIC_ROUTES.includes(req.originalUrl)) {
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

module.exports = { authenticateJWT };
