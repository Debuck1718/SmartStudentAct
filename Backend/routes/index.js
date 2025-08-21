/* routes/index.js – Public API routes */
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail } = require('../utils/mailer');
const User = require('../models/User');
const eventBus = require('../utils/eventBus'); // Make sure this is correctly exported if it's in a separate file

const publicRouter = express.Router();

// --- Joi Schemas for Public Routes ---
const signupOtpSchema = Joi.object({
    phone: Joi.string().pattern(/^\d{10,15}$/).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    firstname: Joi.string().min(2).max(50).required(),
    lastname: Joi.string().min(2).max(50).required(),
    occupation: Joi.string().valid('student', 'teacher', 'admin', 'global_overseer', 'overseer').required(),
    educationLevel: Joi.string().allow('', null),
    grade: Joi.number().integer().min(0).max(12).allow(null),
    schoolName: Joi.string().allow('', null),
    university: Joi.string().allow('', null),
    uniLevel: Joi.string().allow('', null),
    program: Joi.string().allow('', null),
    teacherSchool: Joi.string().allow('', null),
    teacherGrade: Joi.number().integer().min(0).max(12).allow(null),
    schoolCountry: Joi.string().length(2).required()
}).unknown(true);

const verifyOtpSchema = Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required(),
    email: Joi.string().email().required(),
    newPassword: Joi.string().min(8).optional()
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
});

const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: error.details.map(d => d.message)
        });
    }
    next();
};

// --- Auth Routes ---
publicRouter.post('/users/signup-otp',
    rateLimit({ windowMs: 5 * 60 * 1000, max: 3 }),
    validate(signupOtpSchema),
    (req, res) => {
        const { phone, email, firstname } = req.body;
        const code = process.env.NODE_ENV === 'production'
            ? Math.floor(100000 + Math.random() * 900000).toString()
            : '1234';
        req.session.signup = { ...req.body, code, timestamp: Date.now() };
        logger.debug('[OTP] Generated OTP for %s: %s', phone, code);

        sendEmail(
            email,
            'Your SmartStudentAct OTP Code',
            `<p>Hello ${firstname},</p><p>Your OTP code is: <strong>${code}</strong></p><p>This code will expire in 10 minutes.</p>`
        );

        res.json({ step: 'verify', message: 'OTP sent' });
    }
);

publicRouter.post('/users/verify-otp', validate(verifyOtpSchema), async (req, res) => {
    const { code, email } = req.body;
    const signupData = req.session?.signup;

    if (!signupData || signupData.email !== email || signupData.code !== code) {
        return res.status(400).json({ error: 'Invalid OTP or email.' });
    }
    if (Date.now() - signupData.timestamp > 10 * 60 * 1000) {
        delete req.session.signup;
        return res.status(400).json({ error: 'OTP expired.' });
    }

    const hash = await bcrypt.hash(signupData.password, 10);
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30);

    try {
        const newUser = await User.create({
            ...signupData,
            password: hash,
            verified: true,
            is_admin: signupData.occupation === 'admin',
            role: signupData.occupation,
            schoolCountry: signupData.schoolCountry,
            is_on_trial: true,
            trial_end_date: trialEndDate,
            subscription_status: 'inactive'
        });

        delete req.session.signup;
        sendEmail(
            newUser.email,
            'Welcome to SmartStudentAct!',
            `<p>Hi ${newUser.firstname},</p><p>Welcome aboard! Your account has been created successfully. Your 30-day free trial has begun.</p><p>Start exploring our platform today.</p>`
        );

        eventBus.emit('user_signed_up', { userId: newUser._id, email: newUser.email, occupation: newUser.occupation });
        res.status(201).json({ message: 'Account created successfully.' });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Email or phone already registered.' });
        }
        res.status(500).json({ error: 'Account creation failed.' });
    }
});

publicRouter.post('/users/login', validate(loginSchema), async (req, res) => {
    // ✅ This is the correct login route without any authentication middleware.
    console.log("✅ The login route was reached!");
    const { email, password } = req.body;

    const u = await User.findOne({ email }).select('+password +role +is_on_trial +subscription_status');

    if (!u || !(await bcrypt.compare(password, u.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userOccupation = u.role;

    const token = jwt.sign({
        id: u._id,
        email: u.email,
        occupation: userOccupation,
        is_admin: u.is_admin,
        firstname: u.firstname,
        lastname: u.lastname,
        school: u.schoolName || u.teacherSchool || '',
        grade: u.grade || u.teacherGrade || '',
        timezone: u.timezone || 'UTC',
        role: u.role,
        managedRegions: u.managedRegions,
        schoolCountry: u.schoolCountry,
        profile_picture_url: u.profile_picture_url || null
    }, process.env.JWT_SECRET, { expiresIn: '7d' });

    eventBus.emit('user_logged_in', { userId: u._id, email: u.email, occupation: userOccupation });

    res.json({
        token,
        user: {
            id: u._id,
            email: u.email,
            occupation: userOccupation,
            is_admin: u.is_admin,
            firstname: u.firstname,
            lastname: u.lastname,
            school: u.schoolName || u.teacherSchool || '',
            grade: u.grade || u.teacherGrade || '',
            timezone: u.timezone || 'UTC',
            role: u.role,
            is_on_trial: u.is_on_trial,
            subscription_status: u.subscription_status,
            managedRegions: u.managedRegions,
            schoolCountry: u.schoolCountry,
            profile_picture_url: u.profile_picture_url || null
        },
        message: 'Login successful.'
    });
});

publicRouter.post('/auth/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000;
        user.reset_password_token = token;
        user.reset_password_expires = resetTokenExpiry;
        await user.save();
        const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
        sendEmail(
            user.email,
            'Password Reset Request',
            `<p>Hello,</p><p>You are receiving this because you have requested the reset of the password for your account.</p><p>Please click on the following link, or paste this into your browser to complete the process:</p><p><a href="${resetLink}">Reset Password</a></p><p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`
        );
        res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
        logger.error('Forgot password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

publicRouter.post('/auth/reset-password', validate(resetPasswordSchema), async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const user = await User.findOne({
            reset_password_token: token,
            reset_password_expires: { $gt: Date.now() },
        });
        if (!user) {
            return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        user.reset_password_token = undefined;
        user.reset_password_expires = undefined;
        await user.save();
        res.status(200).json({ message: 'Password has been successfully reset.' });
    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

publicRouter.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

module.exports = publicRouter;