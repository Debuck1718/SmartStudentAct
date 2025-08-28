const nodemailer = require('nodemailer');
const logger = require('./logger'); 
const transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT || 587,
    secure: process.env.MAIL_SECURE === 'true', 
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    },
});


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

async function sendEmail(to, subject, html) {
    if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
        logger.error('❌ Email sending failed: MAIL_HOST, MAIL_USER, or MAIL_PASS are not set in environment variables.');
        return; 
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
    }
}


module.exports = { sendEmail, verifyConnection };

