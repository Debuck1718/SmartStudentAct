// utils/mailer.js – Brevo SMTP Version
const nodemailer = require('nodemailer');
const logger = require('./logger'); // Assuming you have a logger utility

// Create a reusable transporter object using the default SMTP transport
const transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT || 587,
    secure: process.env.MAIL_SECURE === 'true', // Use a boolean from the environment variable
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    },
});

/**
 * Checks if the mail transporter is ready to send emails.
 * Useful for health checks or pre-flight checks on server startup.
 */
async function verifyConnection() {
    try {
        await transport.verify();
        logger.info('✅ Email transporter is ready to send messages.');
        return true;
    } catch (error) {
        logger.error('❌ Failed to connect to email transport. Check your environment variables.');
        logger.error('Email transport error:', error);
        return false;
    }
}

/**
 * Sends an email to a user.
 * @param {string} to - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} html - HTML content of the email.
 */
async function sendEmail(to, subject, html) {
    // Check if the required environment variables are set.
    if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
        logger.error('❌ Email sending failed: MAIL_HOST, MAIL_USER, or MAIL_PASS are not set in environment variables.');
        return; // Exit the function gracefully
    }

    const mailOptions = {
        from: `"SmartStudentAct" <${process.env.MAIL_USER}>`,
        to,
        subject,
        html
    };

    try {
        const info = await transport.sendMail(mailOptions);
        logger.info(`📨 Email sent → ${to} → Message ID: ${info.messageId} → Response: ${info.response}`);
    } catch (error) {
        logger.error(`❌ Email sending failed for recipient: ${to}`);
        logger.error('Email error details:', error);
        // You could add more sophisticated logic here, like retries.
    }
}

// Export a single object with all public functions.
module.exports = { sendEmail, verifyConnection };

