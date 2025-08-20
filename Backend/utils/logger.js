// utils/logger.js

const winston = require('winston');

// Create a custom logger using Winston
const logger = winston.createLogger({
  // Set log level based on environment
  // 'info' for production, 'debug' for development
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Include stack trace for errors
    winston.format.splat(), // Allows string interpolation (e.g., logger.info('User %s', 'John'))
    winston.format.json() // Output logs as JSON for structured logging
  ),
  transports: [
    // Log only errors to a file named 'error.log'
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // Log all levels (based on the main level) to a file named 'combined.log'
    new winston.transports.File({ filename: 'combined.log' }),
  ],
  // Handlers for unhandled exceptions and promise rejections
  exceptionHandlers: [
    new winston.transports.File({ filename: 'exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'rejections.log' })
  ]
});

// If not in production, also log to the console
// This makes debugging easier during local development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(), // Add color to console output
      winston.format.simple() // Use a simple, readable format
    )
  }));
}

module.exports = logger;
