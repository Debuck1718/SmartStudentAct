/* routes/index.js – SmartStudent API layer (v3) - MongoDB Edition */
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const Joi = require('joi');
const logger = require('../utils/logger');
const webpush = require('web-push');
const jwt = require('jsonwebtoken');
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { sendEmail } = require('../utils/mailer'); // ✅ Corrected import for your mailer.js file

// Import your middlewares
const { authenticateJWT, hasRole } = require('../middlewares/auth');
const checkSubscription = require('../middlewares/checkSubscription');

const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        // Return a 400 Bad Request with validation error details
        return res.status(400).json({
            message: 'Validation failed',
            errors: error.details.map(d => d.message)
        });
    }
    next();
};

// Import your sub-routers
const advancedGoalsRouter = require('./advancedGoals');
const essayRouter = require('./essay');
const budgetRouter = require('./budget');
const schoolRouter = require('./schoolRoutes'); // 🆕 Import the school router
const uploadRouter = require('./uploadRoutes'); // 🆕 Import the upload router

// --- Models ---
const User = require('../models/User');
const Goal = require('../models/Goal');
const Budget = require('../models/Budget');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const PushSub = require('../models/PushSub');
const School = require('../models/School');
const SchoolCalendar = require('../models/SchoolCalendar');

// --- Services & Utilities ---
const { getUserPrice } = require('../services/pricingService');
const { initFlutterwavePayment } = require('../services/flutterwaveService');
const { initPaystackPayment } = require('../services/paystackService');


/**
 * SMS Helper
 */
// NOTE: You'll need to make sure `smsApi` is properly imported and configured
async function sendSMS(phone, message) {
    if (!phone) return;
    const recipient = phone.startsWith('+') ? phone : `+${phone}`;
    try {
        await smsApi.sendTransacSms({
            sender: process.env.BREVO_SMS_SENDER || 'SmartStudentAct',
            recipient,
            content: message
        });
        logger.info(`[Brevo SMS] Sent to ${recipient}: ${message}`);
    } catch (err) {
        logger.error(`[Brevo SMS] Failed to send to ${recipient}: ${err.message}`);
    }
}

/**
 * Push Helper
 */
async function sendPushToUser(userId, payload) {
    const sub = await PushSub.findOne({ user_id: userId });
    if (sub && sub.subscription) {
        try {
            await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        } catch (err) {
            logger.error('Failed to send push notification to %s: %s', userId, err.message);
        }
    }
}

/**
 * Combined Push + SMS
 */
async function notifyUser(userId, title, message, url) {
    const user = await User.findById(userId).select('phone');
    await sendPushToUser(userId, { title, body: message, url });
    await sendSMS(user?.phone, `${title}: ${message}`);
}

/* ──────────── MAIN ROUTER FUNCTION ──────────── */
// ✅ This function receives the 'cloudinary' object from server.js
module.exports = function buildRouter(app, mongoose, eventBus, agenda, cloudinary) {

    // ✅ Create an Express Router
    const router = express.Router();

// --- MULTER STORAGE SETUP ---
    // This is the local disk storage setup
    const localDiskStorage = multer.diskStorage({
        destination: (req, _file, cb) => {
            // Determine destination based on the route
            let dest;
            if (req.path.includes('/teacher/assignments')) {
                dest = path.join(__dirname, 'uploads', 'assignments');
            } else if (req.path.includes('/student/submissions')) {
                dest = path.join(__dirname, 'uploads', 'submissions');
            } else {
                dest = path.join(__dirname, 'uploads', 'other'); // A generic fallback
            }
            cb(null, dest);
        },
        filename: (_req, file, cb) =>
            cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname).toLowerCase())
    });

    // This is the Cloudinary storage setup for a generic upload route
    const cloudinaryStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: "smartstudent-uploads", // A dedicated folder for these uploads
            allowed_formats: ["jpg", "png", "jpeg", "webp", "gif"],
            transformation: [{ width: 800, crop: "scale" }],
        },
    });

    // This is a special Cloudinary storage for profile pictures
    const profilePictureStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: "smartstudent-profile-pictures",
            allowed_formats: ["jpg", "png", "jpeg", "webp"],
        },
    });

    // Check and create local upload directories
    const dirs = {
        assignments: path.join(__dirname, 'uploads', 'assignments'),
        submissions: path.join(__dirname, 'uploads', 'submissions'),
        feedback: path.join(__dirname, 'uploads', 'feedback'),
        other: path.join(__dirname, 'uploads', 'other')
    };
    Object.values(dirs).forEach(async d => {
        try {
            await fs.mkdir(d, { recursive: true });
            logger.info(`Ensured upload directory exists: ${d}`);
        } catch (error) {
            logger.error(`Failed to create upload directory ${d}: ${error.message}`);
        }
    });

    // We'll create a single `upload` middleware factory that chooses the storage
    const createUploadMiddleware = (storageEngine) => multer({
        storage: storageEngine,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (_req, file, cb) => {
            const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.gif'];
            const fileExtension = path.extname(file.originalname).toLowerCase();
            if (!allowedExtensions.includes(fileExtension)) {
                return cb(new Error('Invalid file type.'), false);
            }
            cb(null, true);
        }
    });

    // ✅ Define the multer instances here, so they are available to all routes
    const localUpload = createUploadMiddleware(localDiskStorage);
    const cloudinaryUpload = createUploadMiddleware(cloudinaryStorage);
    const profileUpload = multer({ storage: profilePictureStorage });


    // ✅ NOTE: Mount your sub-routers
    app.use('/api/rewards', advancedGoalsRouter);
    app.use('/api/budget', budgetRouter);
    app.use('/api/essay', essayRouter);
    app.use('/api/schools', schoolRouter); // 🆕 Use the school router
    app.use('/api/uploads', uploadRouter); // 🆕 Use the upload router

    router.use(authenticateJWT, checkSubscription);

    // --- New Cloudinary Upload Endpoint ---
    // This route uses the 'cloudinaryUpload' middleware
    router.post("/upload/cloudinary", cloudinaryUpload.single("image"), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: "No file was uploaded." });
            }
            res.status(200).json({
                success: true,
                message: "Image uploaded successfully!",
                imageUrl: req.file.path,
                publicId: req.file.filename,
            });
        } catch (error) {
            console.error("❌ Cloudinary upload error:", error);
            res.status(500).json({ success: false, message: "Failed to upload image." });
        }
    });

    // --- Your existing local upload endpoint, now using 'localUpload' ---
    router.post("/upload/local", localUpload.single("file"), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: "No file was uploaded." });
            }
            res.status(200).json({
                success: true,
                message: "File uploaded locally!",
                filePath: req.file.path,
                fileName: req.file.filename,
            });
        } catch (error) {
            console.error("❌ Local upload error:", error);
            res.status(500).json({ success: false, message: "Failed to upload file." });
        }
    });

    // 🆕 New route to securely serve student submissions
    router.get('/student/submissions/:filename', authenticateJWT, hasRole('student', 'teacher', 'admin', 'global_overseer'), async (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = path.join(dirs.submissions, filename);
            const userId = req.user.id;
            const userRole = req.user.role;

            // Check if the file exists
            await fs.access(filePath);

            // Authorization logic
            let isAuthorized = false;
            if (userRole === 'global_overseer' || userRole === 'admin') {
                isAuthorized = true; // Admins and overseers have blanket access
            } else {
                // Find the submission record to check ownership
                const submission = await Submission.findOne({ submission_file: `/uploads/submissions/${filename}` }).populate('user_id');
                if (submission) {
                    if (userRole === 'student' && submission.user_id._id.toString() === userId) {
                        isAuthorized = true; // The student can view their own submission
                    } else if (userRole === 'teacher' && submission.user_id.schoolName === req.user.schoolName && submission.user_id.grade === req.user.grade) {
                        isAuthorized = true; // The teacher can view their students' submissions
                    }
                }
            }

            if (isAuthorized) {
                res.sendFile(filePath);
            } else {
                res.status(403).json({ message: 'Forbidden. You do not have permission to view this file.' });
            }
        } catch (error) {
            logger.error('Error serving student submission file:', error);
            if (error.code === 'ENOENT') {
                res.status(404).json({ message: 'File not found.' });
            } else {
                res.status(500).json({ message: 'Server error occurred while retrieving file.' });
            }
        }
    });

    // 🆕 New route to securely serve teacher-assigned files
    router.get('/teacher/assignments/:filename', authenticateJWT, hasRole('student', 'teacher', 'admin', 'global_overseer'), async (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = path.join(dirs.assignments, filename);
            const userId = req.user.id;
            const userRole = req.user.role;

            await fs.access(filePath);

            let isAuthorized = false;
            if (userRole === 'global_overseer' || userRole === 'admin') {
                isAuthorized = true;
            } else {
                const assignment = await Assignment.findOne({ attachment_file: `/uploads/assignments/${filename}` });
                if (assignment) {
                    if (userRole === 'teacher' && assignment.created_by.toString() === userId) {
                        isAuthorized = true; // The teacher can view their own assignment files
                    } else if (userRole === 'student' && assignment.assigned_to_users.includes(req.user.email)) {
                        isAuthorized = true; // The student can view files assigned to them
                    }
                }
            }

            if (isAuthorized) {
                res.sendFile(filePath);
            } else {
                res.status(403).json({ message: 'Forbidden. You do not have permission to view this file.' });
            }
        } catch (error) {
            logger.error('Error serving assignment file:', error);
            if (error.code === 'ENOENT') {
                res.status(404).json({ message: 'File not found.' });
            } else {
                res.status(500).json({ message: 'Server error occurred while retrieving file.' });
            }
        }
    });

    // 🆕 New route for securely serving feedback files
    router.get('/teacher/feedback/:filename', authenticateJWT, hasRole('student', 'teacher', 'admin', 'global_overseer'), async (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = path.join(dirs.feedback, filename);
            const userId = req.user.id;
            const userRole = req.user.role;

            await fs.access(filePath);

            let isAuthorized = false;
            if (userRole === 'global_overseer' || userRole === 'admin') {
                isAuthorized = true;
            } else {
                const submission = await Submission.findOne({ feedback_file: `/uploads/feedback/${filename}` });
                if (submission) {
                    if (userRole === 'teacher') {
                        const assignment = await Assignment.findById(submission.assignment_id);
                        if (assignment && assignment.created_by.toString() === userId) {
                            isAuthorized = true;
                        }
                    } else if (userRole === 'student' && submission.user_id.toString() === userId) {
                        isAuthorized = true; // Student can view feedback for their submission
                    }
                }
            }
            if (isAuthorized) {
                res.sendFile(filePath);
            } else {
                res.status(403).json({ message: 'Forbidden. You do not have permission to view this file.' });
            }
        } catch (error) {
            logger.error('Error serving feedback file:', error);
            if (error.code === 'ENOENT') {
                res.status(404).json({ message: 'File not found.' });
            } else {
                res.status(500).json({ message: 'Server error occurred while retrieving file.' });
            }
        }
    });

    /* ──────────── Joi Schemas ──────────── */
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

    const timezoneSchema = Joi.object({
        timezone: Joi.string().required()
    });

    const promoteUserSchema = Joi.object({
        email: Joi.string().email().required(),
        make_admin: Joi.boolean().required(),
        role: Joi.string().valid('student', 'teacher', 'admin', 'global_overseer', 'overseer').optional()
    });

    const removeUserSchema = Joi.object({
        email: Joi.string().email().required()
    });

    const setAdminSchema = Joi.object({
        email: Joi.string().email().required(),
        promote: Joi.boolean().required()
    });

    // NOTE: The Joi schemas for goals and budget have been moved
    // to their respective sub-router files to reduce code duplication.

    const teacherAssignmentSchema = Joi.object({
        title: Joi.string().required(),
        description: Joi.string().allow('', null),
        due_date: Joi.date().iso().required(),
        assigned_to_users: Joi.array().items(Joi.string().email()).default([]),
        assigned_to_grades: Joi.array().items(Joi.number().integer().min(0).max(12)).default([]),
        assigned_to_schools: Joi.array().items(Joi.string()).default([])
    }).unknown(true);

    const feedbackSchema = Joi.object({
        feedback_grade: Joi.number().min(0).max(100).optional(),
        feedback_comments: Joi.string().allow('', null)
    });

    const paymentSchema = Joi.object({
        gateway: Joi.string().valid('flutterwave', 'paystack').required()
    });

    const paymentSuccessSchema = Joi.object({
        gateway: Joi.string().valid('flutterwave', 'paystack').required(),
        transaction_reference: Joi.string().required()
    });

    const schoolSchema = Joi.object({
        name: Joi.string().min(2).required(),
        country: Joi.string().length(2).uppercase().required(),
        tier: Joi.number().integer().min(1).required(),
    });

    // ✅ New Joi Schema for assigning a region to an Overseer
    const assignRegionSchema = Joi.object({
        overseerEmail: Joi.string().email().required(),
        region: Joi.string().required()
    });

    // ✅ New Joi Schema for the academic calendar
    const academicCalendarSchema = Joi.object({
        schoolName: Joi.string().required(),
        academicYear: Joi.string().required(),
        terms: Joi.array().items(Joi.object({
            termName: Joi.string().required(),
            startDate: Joi.date().iso().required(),
            endDate: Joi.date().iso().required()
        })).min(1).required()
    });

    // ✅ New Joi Schema for the user settings update
    const settingsSchema = Joi.object({
        firstname: Joi.string().min(2).max(50).optional(),
        lastname: Joi.string().min(2).max(50).optional(),
        email: Joi.string().email().optional(),
        phone: Joi.string().pattern(/^\d{10,15}$/).optional(),
        educationLevel: Joi.string().allow('', null).optional(),
        grade: Joi.number().integer().min(0).max(12).allow(null).optional(),
        schoolName: Joi.string().allow('', null).optional(),
        university: Joi.string().allow('', null).optional(),
        uniLevel: Joi.string().allow('', null).optional(),
        program: Joi.string().allow('', null).optional(),
        teacherSchool: Joi.string().allow('', null).optional(),
        teacherGrade: Joi.number().integer().min(0).max(12).allow(null).optional(),
        schoolCountry: Joi.string().length(2).optional(),
    }).min(1).unknown(true);

    // ✅ New Joi Schema for password update
    const passwordUpdateSchema = Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(8).required()
    });

    /* ──────────── Auth Routes ──────────── */
    router.post('/users/signup-otp',
        rateLimit({ windowMs: 5 * 60 * 1000, max: 3 }),
        validate(signupOtpSchema),
        (req, res) => {
            const { phone, email, firstname } = req.body;
            const code = process.env.NODE_ENV === 'production'
                ? Math.floor(100000 + Math.random() * 900000).toString()
                : '1234';
            req.session.signup = { ...req.body, code, timestamp: Date.now() };
            logger.debug('[OTP] Generated OTP for %s: %s', phone, code);

            sendEmail( // ✅ Corrected function name
                email,
                'Your SmartStudentAct OTP Code',
                `<p>Hello ${firstname},</p><p>Your OTP code is: <strong>${code}</strong></p><p>This code will expire in 10 minutes.</p>`
            );

            res.json({ step: 'verify', message: 'OTP sent' });
        }
    );

    router.post('/users/verify-otp', validate(verifyOtpSchema), async (req, res) => {
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
            sendEmail( // ✅ Corrected function name
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

    router.post('/users/login', validate(loginSchema), async (req, res) => {
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

    /**
     * @route POST /auth/forgot-password
     * @desc Sends a password reset link to the user's email
     * @access Public
     */
    router.post('/auth/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
        try {
            const { email } = req.body;
            const user = await User.findOne({ email });

            // We send a success message even if the user isn't found to prevent email enumeration attacks
            if (!user) {
                return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
            }

            // Generate a secure token
            const token = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiry = Date.now() + 3600000; // 1 hour

            // Save the token and its expiration to the user's document
            user.reset_password_token = token;
            user.reset_password_expires = resetTokenExpiry;
            await user.save();

            // Create the reset link
            const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;

            // Send the email
            sendEmail( // ✅ Corrected function name
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
    
    /**
     * @route POST /auth/reset-password
     * @desc Resets the user's password using a valid token
     * @access Public
     */
    router.post('/auth/reset-password', validate(resetPasswordSchema), async (req, res) => {
        try {
            const { token, newPassword } = req.body;

            // Find the user with the given token and that the token is not expired
            const user = await User.findOne({
                reset_password_token: token,
                reset_password_expires: { $gt: Date.now() },
            });

            if (!user) {
                return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
            }

            // Hash the new password and save it
            user.password = await bcrypt.hash(newPassword, 10);
            user.reset_password_token = undefined; // Clear the token
            user.reset_password_expires = undefined; // Clear the expiration
            await user.save();

            res.status(200).json({ message: 'Password has been successfully reset.' });

        } catch (error) {
            logger.error('Reset password error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

    router.post('/logout', authenticateJWT, (req, res) => {
        eventBus.emit('user_logged_out', { userId: req.user.id });
        res.json({ message: 'Logged out successfully (client should discard token).' });
    });

    router.post('/timezone', authenticateJWT, validate(timezoneSchema), async (req, res) => {
        const { timezone } = req.body;
        const userId = req.user.id;
        const result = await User.updateOne({ _id: userId }, { timezone });
        if (result.modifiedCount > 0) {
            res.json({ ok: true, message: 'Timezone updated.' });
        } else {
            res.status(404).json({ error: 'User not found or no change.' });
        }
    });

    /* ──────────── Settings and Profile Routes ──────────── */
    /**
     * @route PATCH /api/settings
     * @desc Update general user settings
     * @access Private (Authenticated User)
     */
    router.patch('/settings', authenticateJWT, validate(settingsSchema), async (req, res) => {
        const userId = req.user.id;
        const updateData = req.body;

        try {
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }

            // If a new email is provided, check if it's already in use by another user
            if (updateData.email && updateData.email !== user.email) {
                const existingUser = await User.findOne({ email: updateData.email });
                if (existingUser) {
                    return res.status(409).json({ message: 'Email already in use.' });
                }
            }

            // Update user document
            const result = await User.updateOne({ _id: userId }, updateData);
            if (result.modifiedCount > 0) {
                res.status(200).json({ message: 'Settings updated successfully.', updatedFields: updateData });
            } else {
                res.status(200).json({ message: 'No changes were made.' });
            }
        } catch (error) {
            logger.error('Error updating user settings:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

/**
 * @route GET /api/profile
 * @desc Get user profile data
 * @access Private (Authenticated User)
 * This route is crucial for the front-end to load the existing user data
 * and populate the form fields when the page loads.
 */
router.get('/profile', authenticateJWT, async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findById(userId).select('-password'); // Exclude password for security
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.status(200).json(user);
    } catch (error) {
        logger.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @route PATCH /api/profile
 * @desc Update general user profile information (excluding the photo)
 * @access Private (Authenticated User)
 * This route is now a single, comprehensive endpoint for all profile data updates.
 * It does NOT handle file uploads.
 */
router.patch('/profile', authenticateJWT, validate(settingsSchema), async (req, res) => {
    const userId = req.user.id;
    const updateData = req.body;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // IMPORTANT: Prevent email or other sensitive fields from being updated here if needed.
        // For this example, we'll allow all fields from the schema.
        
        // The front-end sends a single object with all fields; let's update all of them
        const result = await User.updateOne({ _id: userId }, { $set: updateData });
        
        if (result.modifiedCount > 0) {
            // Fetch the updated user document to send back to the client
            const updatedUser = await User.findById(userId).select('-password');
            res.status(200).json({ 
                message: 'Profile updated successfully.', 
                updatedFields: updateData,
                user: updatedUser
            });
        } else {
            res.status(200).json({ message: 'No changes were made.' });
        }
    } catch (error) {
        // Handle MongoDB duplicate key error (e.g., if a unique field like 'phone' is duplicated)
        if (error.code === 11000) {
            return res.status(409).json({ message: 'A user with this data already exists.' });
        }
        logger.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});


/**
 * @route POST /api/profile/upload-photo
 * @desc Update user profile picture via a dedicated endpoint.
 * @access Private (Authenticated User)
 * This is a new route specifically for the photo upload, which aligns with the
 * front-end's `handlePhotoUpload` function.
 */
router.post('/profile/upload-photo', authenticateJWT, profileUpload.single('profilePhoto'), async (req, res) => {
    const userId = req.user.id;
    
    // Check if a file was uploaded by multer
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    try {
        // Get the URL from the uploaded file's path (e.g., from Cloudinary)
        const photoUrl = req.file.path;

        // Update the user's profile_picture_url in the database
        const result = await User.updateOne(
            { _id: userId }, 
            { $set: { profile_picture_url: photoUrl } }
        );

        if (result.modifiedCount > 0) {
            res.status(200).json({
                message: 'Profile picture updated successfully.',
                photoUrl: photoUrl
            });
        } else {
            res.status(200).json({ message: 'No changes were made.' });
        }
    } catch (error) {
        logger.error('Error uploading profile picture:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

    /* ──────────── Admin Routes ──────────── */

    router.post('/admin/promote', authenticateJWT, hasRole(['overseer', 'global_overseer']), validate(promoteUserSchema), async (req, res) => {
        const { email, make_admin, role } = req.body;
        const actor = req.user;

        try {
            const targetUser = await User.findOne({ email });
            if (!targetUser) return res.status(404).json({ error: 'Target user not found.' });
            if (targetUser.email === actor.email) return res.status(403).json({ error: 'Cannot modify your own account.' });

            if (actor.occupation !== 'global_overseer' &&
                (targetUser.occupation === 'overseer' || targetUser.occupation === 'global_overseer')) {
                return res.status(403).json({ error: 'You do not have permission to modify this user.' });
            }

            await User.updateOne({ email }, { is_admin: make_admin, role, occupation: role });
            logger.info('User %s promoted/demoted by %s', email, actor.email);
            res.json({ message: 'User updated successfully.' });
        } catch (e) {
            res.status(500).json({ error: 'Failed to update user status.' });
        }
    });

    router.post('/admin/remove-user', authenticateJWT, hasRole(['admin', 'overseer', 'global_overseer']), validate(removeUserSchema), async (req, res) => {
        const { email } = req.body;
        const actor = req.user;
        if (actor.email === email) {
            return res.status(403).json({ error: 'Cannot remove your own account.' });
        }
        try {
            const targetUser = await User.findOne({ email });
            if (!targetUser) return res.status(404).json({ error: 'User not found.' });
            if (actor.occupation === 'overseer' && (targetUser.occupation === 'overseer' || targetUser.occupation === 'global_overseer')) {
                return res.status(403).json({ error: 'You do not have permission to remove this user.' });
            }
            if (actor.is_admin) {
                if (targetUser.is_admin || ['overseer', 'global_overseer'].includes(targetUser.occupation)) {
                    return res.status(403).json({ error: 'You cannot remove this user.' });
                }
                const sameSchool = [targetUser.schoolName, targetUser.teacherSchool].includes(actor.school);
                if (!sameSchool) return res.status(403).json({ error: 'Can only remove users from your school.' });
            }
            const result = await User.deleteOne({ email });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'User not found or not authorized.' });
            }
            logger.info('User %s removed by %s', email, actor.email);
            res.json({ message: 'User removed successfully.' });
        } catch (e) {
            res.status(500).json({ error: 'Failed to remove user.' });
        }
    });

    router.get('/admin/schools', authenticateJWT, hasRole(['admin', 'overseer', 'global_overseer']), async (req, res) => {
        try {
            const schools = await User.aggregate([
                { $project: { school: { $ifNull: ['$schoolName', '$teacherSchool'] } } },
                { $match: { school: { $ne: null } } },
                { $group: { _id: '$school' } }
            ]);
            res.json(schools.map(s => s._id));
        } catch (e) {
            res.status(500).json({ error: 'Failed to retrieve schools.' });
        }
    });

    router.post('/admin/set-admin', authenticateJWT, hasRole(['admin', 'overseer', 'global_overseer']), validate(setAdminSchema), async (req, res) => {
        const { email, promote } = req.body;
        const actor = req.user;
        try {
            const target = await User.findOne({ email });
            if (!target) return res.status(404).json({ error: 'User not found' });
            const isOverseerActor = ['overseer', 'global_overseer'].includes(actor.occupation);
            const isTargetHigher = ['overseer', 'global_overseer'].includes(target.occupation);
            if (!isOverseerActor && isTargetHigher) {
                return res.status(403).json({ error: 'Cannot modify other administrators.' });
            }
            const sameSchool = [target.schoolName, target.teacherSchool].includes(actor.school);
            if (!isOverseerActor && !sameSchool) {
                return res.status(403).json({ error: 'Can only modify users from your school' });
            }
            await User.updateOne({ email }, { is_admin: promote });
            res.json({ message: 'Updated' });
        } catch (err) {
            res.status(500).json({ error: 'DB error' });
        }
    });

    // --- New route to add a school ---
    router.post('/admin/schools/add', authenticateJWT, hasRole(['overseer', 'global_overseer']), validate(schoolSchema), async (req, res) => {
        const { name, country, tier } = req.body;
        try {
            const newSchool = new School({ name, country, tier });
            await newSchool.save();
            res.status(201).json(newSchool);
        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({ error: 'A school with this name already exists.' });
            }
            logger.error('Error adding school:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    });

    // ✅ New: Route for Overseer Dashboard Overview
    router.get('/overseer/dashboard-overview', authenticateJWT, hasRole(['overseer', 'global_overseer']), async (req, res) => {
        const { managedRegions } = req.user;
        if (!managedRegions || managedRegions.length === 0) {
            return res.json({ managedRegions: [] });
        }
        try {
            const overviewData = await Promise.all(managedRegions.map(async (region) => {
                // Find schools in the region
                const schoolsInRegion = await School.find({ country: region });
                const schoolNames = schoolsInRegion.map(school => school.name);
                // Count users and admins in those schools
                const usersInSchools = await User.find({
                    $or: [
                        { schoolName: { $in: schoolNames } },
                        { teacherSchool: { $in: schoolNames } }
                    ]
                });
                const totalAdmins = usersInSchools.filter(user => user.is_admin).length;
                return { name: region, totalSchools: schoolNames.length, totalAdmins };
            }));
            res.json({ managedRegions: overviewData });
        } catch (e) {
            logger.error('Failed to get overseer dashboard data:', e);
            res.status(500).json({ error: 'Failed to retrieve dashboard data.' });
        }
    });

    // ✅ New: Route to assign a region to an Overseer
    router.post('/admin/assign-region', authenticateJWT, hasRole(['global_overseer']), validate(assignRegionSchema), async (req, res) => {
        const { overseerEmail, region } = req.body;
        try {
            const targetUser = await User.findOne({ email: overseerEmail });
            if (!targetUser) {
                return res.status(404).json({ error: 'Overseer user not found.' });
            }
            if (targetUser.occupation !== 'overseer' && targetUser.occupation !== 'global_overseer') {
                return res.status(400).json({ error: 'Target user is not an overseer.' });
            }

            // Push the new region to the managedRegions array if it's not already there
            await User.updateOne({ email: overseerEmail }, {
                $addToSet: { managedRegions: region }
            });

            res.json({ message: `Successfully assigned region ${region} to overseer ${overseerEmail}.` });
        } catch (e) {
            logger.error('Error assigning region:', e);
            res.status(500).json({ error: 'Failed to assign region.' });
        }
    });

    // 🆕 New route for a Global Overseer to view all uploaded files
router.get('/admin/all-files', authenticateJWT, hasRole(['global_overseer']), async (req, res) => {
    try {
        // Fetch all assignments and their file paths
        const assignments = await Assignment.find({ attachment_file: { $ne: null } }).select('title attachment_file created_by');
        const assignmentFiles = assignments.map(a => ({
            id: a._id,
            filename: path.basename(a.attachment_file),
            type: 'Assignment',
            filePath: a.attachment_file,
            createdBy: a.created_by,
        }));

        // Fetch all submissions and their file paths
        const submissions = await Submission.find({ $or: [{ submission_file: { $ne: null } }, { feedback_file: { $ne: null } }] }).populate('user_id', 'email');
        const submissionFiles = submissions.flatMap(s => {
            const files = [];
            if (s.submission_file) {
                files.push({
                    id: s._id,
                    filename: path.basename(s.submission_file),
                    type: 'Submission',
                    filePath: s.submission_file,
                    uploadedBy: s.user_id ? s.user_id.email : 'Unknown',
                });
            }
            if (s.feedback_file) {
                files.push({
                    id: s._id,
                    filename: path.basename(s.feedback_file),
                    type: 'Feedback',
                    filePath: s.feedback_file,
                    uploadedBy: s.user_id ? s.user_id.email : 'Unknown',
                });
            }
            return files;
        });

        // Combine all file lists
        const allFiles = [...assignmentFiles, ...submissionFiles];

        res.status(200).json({ success: true, files: allFiles });
    } catch (error) {
        logger.error('Error fetching all files for overseer:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve all file data.' });
    }
});

// 🆕 New universal file-serving route for Global Overseer
router.get('/admin/view-file/:type/:filename', authenticateJWT, hasRole(['global_overseer']), async (req, res) => {
    try {
        const { type, filename } = req.params;
        let filePath;

        // Map the type to the correct local directory
        switch (type.toLowerCase()) {
            case 'assignment':
                filePath = path.join(__dirname, 'uploads', 'assignments', filename);
                break;
            case 'submission':
                filePath = path.join(__dirname, 'uploads', 'submissions', filename);
                break;
            case 'feedback':
                filePath = path.join(__dirname, 'uploads', 'feedback', filename);
                break;
            default:
                return res.status(400).json({ message: 'Invalid file type.' });
        }

        // Check if the file exists and is readable
        await fs.access(filePath);
        
        // Send the file
        res.sendFile(filePath);

    } catch (error) {
        logger.error('Error serving file for overseer:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ message: 'File not found.' });
        } else {
            res.status(500).json({ message: 'Server error occurred while retrieving file.' });
        }
    }
});

/* ──────────── Payment & Pricing Routes ──────────── */
    
    // Get the user's current price based on their role and school
    router.get('/pricing', authenticateJWT, async (req, res) => {
        const { occupation, school, grade } = req.user;
        const user = await User.findById(req.user.id).select('country');

        if (!user || !user.country) {
            return res.status(400).json({ error: 'User country not found.' });
        }

        try {
            const price = await getUserPrice(user.country, occupation, school);
            res.json(price);
        } catch (err) {
            logger.error('Error getting user price:', err);
            res.status(500).json({ error: 'Failed to retrieve pricing information.' });
        }
    });

    // Initiate a payment transaction
    router.post('/payment/initiate', authenticateJWT, validate(paymentSchema), async (req, res) => {
        const { gateway } = req.body;
        const { email, id, occupation, school } = req.user;
        const user = await User.findById(id).select('country');

        if (!user || !user.country) {
            return res.status(400).json({ error: 'User country not found.' });
        }

        // Users who don't pay shouldn't initiate payments.
        if (['student', 'overseer', 'global_overseer'].includes(occupation)) {
            return res.status(403).json({ error: 'Forbidden: This role does not require payment.' });
        }

        try {
            const priceInfo = await getUserPrice(user.country, occupation, school);
            const amount = priceInfo.localPrice;
            const currency = priceInfo.currency;

            if (amount <= 0) {
                return res.status(400).json({ error: 'Invalid payment amount.' });
            }

            let paymentData;
            if (gateway === 'flutterwave') {
                paymentData = await initFlutterwavePayment(email, amount, currency);
            } else if (gateway === 'paystack') {
                paymentData = await initPaystackPayment(email, amount, currency);
            }

            if (paymentData) {
                res.json({ message: 'Payment initiated successfully.', data: paymentData });
            } else {
                res.status(500).json({ error: 'Failed to initiate payment.' });
            }
        } catch (err) {
            logger.error('Error initiating payment:', err);
            res.status(500).json({ error: 'Failed to initiate payment.' });
        }
    });
    
    // Start a free trial for a user
    router.post('/trial/start', authenticateJWT, async (req, res) => {
        const userId = req.user.id;
        try {
            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).json({ error: 'User not found.' });
            }

            if (user.is_on_trial || user.has_used_trial) {
                return res.status(400).json({ error: 'Trial has already been used or is currently active.' });
            }

            // Set trial flags
            user.is_on_trial = true;
            user.trial_starts_at = new Date();
            user.has_used_trial = true;
            await user.save();

            // Schedule an Agenda job to end the trial after 14 days
            agenda.schedule('in 14 days', 'end-trial', { userId: user._id });

            logger.info('Free trial started for user:', userId);
            res.json({ message: 'Free trial started successfully. It will end in 14 days.' });
        } catch (err) {
            logger.error('Error starting free trial:', err);
            res.status(500).json({ error: 'Failed to start free trial.' });
        }
    });
    
/* ──────────── Teacher Routes ──────────── */
/**
 * @route GET /api/teacher/profile
 * @desc Gets the profile information of the logged-in teacher.
 * @access Private (Teacher Only)
 */
router.get('/teacher/profile', authenticateJWT, hasRole('teacher'), async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id).select('-password');
        if (!teacher) {
            return res.status(404).json({ message: 'Teacher profile not found.' });
        }
        res.status(200).json(teacher);
    } catch (error) {
        logger.error('Error fetching teacher profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route POST /api/teacher/calendar
 * @desc Allows a teacher to submit the academic calendar for their school.
 * @access Private (Teacher Only)
 */
router.post('/teacher/calendar', authenticateJWT, hasRole('teacher'), validate(academicCalendarSchema), async (req, res) => {
    const { schoolName, academicYear, terms } = req.body;
    const teacherId = req.user.id;

    try {
        // Find the teacher's school to get the school ID
        const school = await School.findOne({ name: schoolName });
        if (!school) {
            return res.status(404).json({ message: 'School not found.' });
        }

        // Check if a calendar for this school and year already exists
        let schoolCalendar = await SchoolCalendar.findOne({ school: school._id, academicYear });

        if (schoolCalendar) {
            // If it exists, update it
            schoolCalendar.teacher_id = teacherId;
            schoolCalendar.terms = terms;
            await schoolCalendar.save();
            res.status(200).json({ message: 'Academic calendar updated successfully.', calendar: schoolCalendar });
        } else {
            // If it doesn't exist, create a new one
            schoolCalendar = new SchoolCalendar({
                teacher_id: teacherId,
                school: school._id,
                schoolName: school.name,
                academicYear,
                terms
            });
            await schoolCalendar.save();
            res.status(201).json({ message: 'Academic calendar submitted successfully.', calendar: schoolCalendar });
        }
    } catch (error) {
        logger.error('Error submitting academic calendar:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route POST /api/teacher/assignments
 * @desc Creates a new assignment for a student and emits an event.
 * @access Private (Teacher Only)
 */
router.post('/teacher/assignments', authenticateJWT, hasRole('teacher'), localUpload.single('file'), async (req, res) => {
    try {
        const { studentEmail, title, description, dueDate } = req.body;
        const teacherId = req.user.id;

        if (!studentEmail || !title || !dueDate) {
            return res.status(400).json({ message: 'Missing required fields: studentEmail, title, or dueDate.' });
        }
        
        // Find the student by email to get their ID and other details
        const student = await User.findOne({ email: studentEmail, role: 'student' });
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        const newAssignment = new Assignment({
            title,
            description,
            due_date: new Date(dueDate),
            created_by: teacherId,
            // Assign to the specific student
            assigned_to_users: [student.email], 
            assigned_to_schools: [student.schoolName],
            assigned_to_grades: [student.grade],
            attachment_file: req.file ? `/uploads/assignments/${req.file.filename}` : null,
        });

        await newAssignment.save();

        // Emit the event for assignment creation to trigger notifications and reminders
        eventBus.emit('assignment_created', {
            assignmentId: newAssignment._id,
            title: newAssignment.title,
            creatorId: teacherId,
        });

        res.status(201).json({ message: 'Assignment created successfully!', assignment: newAssignment });
    } catch (error) {
        logger.error('Error creating assignment:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route GET /api/teacher/assignments/:teacherId
 * @desc Gets all assignments created by a specific teacher.
 * @access Private (Teacher Only)
 */
router.get('/teacher/assignments/:teacherId', authenticateJWT, hasRole('teacher'), async (req, res) => {
    try {
        const assignments = await Assignment.find({ created_by: req.params.teacherId });
        res.status(200).json({ assignments });
    } catch (error) {
        logger.error('Error fetching teacher assignments:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route POST /api/teacher/feedback/:submissionId
 * @desc Teacher leaves feedback and/or a grade on a student submission.
 * @access Private (Teacher Only)
 */
router.post(
    '/teacher/feedback/:submissionId',
    authenticateJWT,
    hasRole('teacher'),
    localUpload.single('feedbackFile'),
    async (req, res) => {
        try {
            const { submissionId } = req.params;
            const { grade, comments } = req.body;
            const submission = await Submission.findById(submissionId);
            if (!submission) return res.status(404).json({ message: 'Submission not found' });
            
            const assignment = await Assignment.findById(submission.assignment_id);
            const studentId = submission.user_id;
            
            // Update submission with feedback/grade
            submission.feedback_grade = grade || null;
            submission.feedback_comments = comments || null;
            submission.feedback_file = req.file ? `/uploads/feedback/${req.file.filename}` : null;
            submission.feedback_given_at = new Date();
            await submission.save();

            // Conditional event emission based on the presence of a grade
            if (grade) {
                eventBus.emit('assignment_graded', {
                    assignmentId: assignment._id,
                    studentId: studentId,
                    grade: grade
                });
            } else if (comments) {
                eventBus.emit('feedback_given', {
                    assignmentId: assignment._id,
                    studentId: studentId,
                    feedback: comments
                });
            }

            res.status(200).json({ message: 'Feedback saved successfully!', submission });
        } catch (error) {
            logger.error('Error saving feedback:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route GET /api/teacher/students
 * @desc Fetches all students in the same school and class as the logged-in teacher.
 * @access Private (Teacher Only)
 */
router.get('/teacher/students', authenticateJWT, hasRole('teacher'), async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id);
        if (!teacher || !teacher.schoolName || !teacher.grade) {
            return res.status(400).json({ message: 'Teacher school or grade information is missing.' });
        }
        const students = await User.find({
            role: 'student',
            schoolName: teacher.schoolName,
            grade: teacher.grade
        }).select('firstname lastname email grade'); // Select only necessary fields

        res.status(200).json(students); // Return the students array directly
    } catch (error) {
        logger.error('Error fetching students for teacher\'s class:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route GET /api/teacher/overdue-tasks
 * @desc Fetches all assignments that are overdue for students in the teacher's class.
 * @access Private (Teacher Only)
 */
router.get('/teacher/overdue-tasks', authenticateJWT, hasRole('teacher'), async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id);
        const now = new Date();
        
        // Find assignments created by this teacher that are overdue
        const overdueAssignments = await Assignment.find({
            created_by: req.user.id,
            due_date: { $lt: now },
        });

        // Find submissions for these assignments
        const submissionAssignmentIds = overdueAssignments.map(a => a._id);
        const submittedAssignments = await Submission.find({
            assignment_id: { $in: submissionAssignmentIds }
        });

        const submittedMap = new Map();
        submittedAssignments.forEach(sub => submittedMap.set(sub.assignment_id.toString(), true));

        // Filter for assignments that have not been submitted
        const unsubmittedOverdue = overdueAssignments.filter(assignment => !submittedMap.has(assignment._id.toString()));

        // Format the output
        const formattedTasks = await Promise.all(unsubmittedOverdue.map(async (assignment) => {
            // Find the student(s) the assignment was assigned to.
            // Assuming it was only assigned to one student for simplicity based on the frontend code.
            const student = await User.findOne({ email: assignment.assigned_to_users[0] });
            return {
                title: assignment.title,
                due_datetime: assignment.due_date,
                student_email: student.email,
                // Add any other details needed for the frontend render
            };
        }));
        
        res.status(200).json(formattedTasks);
    } catch (error) {
        logger.error('Error fetching overdue tasks:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @route GET /api/teacher/assigned-tasks
 * @desc Fetches all assignments assigned by the current teacher.
 * @access Private (Teacher Only)
 */
router.get('/teacher/assigned-tasks', authenticateJWT, hasRole('teacher'), async (req, res) => {
    try {
        const assignedTasks = await Assignment.find({ created_by: req.user.id });
        const formattedTasks = assignedTasks.map(t => ({
            title: t.title,
            due_datetime: t.due_date,
            student_email: t.assigned_to_users[0], // Assuming single student for simplicity
            subject: 'N/A', // Frontend expects a subject
            attachment: t.attachment_file,
        }));
        res.status(200).json(formattedTasks);
    } catch (error) {
        logger.error('Error fetching assigned tasks:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route GET /api/teacher/feedback
 * @desc Fetches all submissions that have received feedback from the current teacher.
 * @access Private (Teacher Only)
 */
router.get('/teacher/feedback', authenticateJWT, hasRole('teacher'), async (req, res) => {
    try {
        // Find all submissions that have feedback/grades
        const submissionsWithFeedback = await Submission.find({
            $or: [
                { feedback_grade: { $ne: null } },
                { feedback_comments: { $ne: null } }
            ]
        }).populate('user_id', 'email'); // Populate user data to get email

        // Filter submissions to only those where the associated assignment was created by the current teacher
        const teacherSubmissions = await Promise.all(submissionsWithFeedback.filter(async (sub) => {
            const assignment = await Assignment.findById(sub.assignment_id);
            return assignment && assignment.created_by.toString() === req.user.id;
        }));

        const formattedFeedback = teacherSubmissions.map(f => ({
            student_email: f.user_id?.email,
            message: f.feedback_comments || `Graded: ${f.feedback_grade}`,
            file_name: f.feedback_file,
        }));
        
        res.status(200).json(formattedFeedback);
    } catch (error) {
        logger.error('Error fetching feedback:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


/**
 * @route POST /api/teacher/message
 * @desc Sends a notification message to a specific student.
 * @access Private (Teacher Only)
 */
router.post('/teacher/message', authenticateJWT, hasRole('teacher'), async (req, res) => {
    const { to, text } = req.body;
    try {
        const student = await User.findOne({ email: to, role: 'student' });
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }
        
        // Use the eventBus to send the notification
        eventBus.emit('teacher_message', {
            userId: student._id,
            message: text,
            teacherName: req.user.firstname,
        });

        res.status(200).json({ message: 'Message sent successfully!' });
    } catch (error) {
        logger.error('Error sending message:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route GET /api/teacher/students/other
 * @desc Fetches all students in the same school but NOT the same class as the logged-in teacher.
 * @access Private (Teacher Only)
 */
router.get('/teacher/students/other', authenticateJWT, hasRole('teacher'), async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id);
        if (!teacher || !teacher.schoolName || !teacher.grade) {
            return res.status(400).json({ message: 'Teacher school or grade information is missing.' });
        }
        const otherStudents = await User.find({
            role: 'student',
            schoolName: teacher.schoolName,
            grade: { $ne: teacher.grade }
        }).select('firstname lastname email grade');

        res.status(200).json({ students: otherStudents });
    } catch (error) {
        logger.error('Error fetching students from other classes:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


    // --- Student Routes ---
    /**
     * @route GET /api/student/assignments/:studentId
     * @desc Gets all assignments for a student's class.
     * @access Private (Student Only)
     */
    router.get('/student/assignments/:studentId', authenticateJWT, hasRole('student'), async (req, res) => {
        try {
            // Logic to find the student's class and then fetch assignments for that class
            // This is a placeholder; you would need a way to link a student to a class
            const student = await User.findById(req.params.studentId);
            if (!student) {
                return res.status(404).json({ message: 'Student not found.' });
            }
            // Assuming the User model has a 'class' field
            const assignments = await Assignment.find({ class: student.class });
            res.status(200).json({ assignments });
        } catch (error) {
            logger.error('Error fetching student assignments:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });

  /**
     * @route POST /api/student/submissions
     * @desc Submits an assignment (text + optional file).
     * @access Private (Student Only)
     */
    router.post(
      '/student/submissions',
      authenticateJWT,
      hasRole('student'),
      localUpload.single('file'),  // ✅ Use the correctly defined localUpload instance
      async (req, res) => {
        try {
          const { assignmentId, studentId, submissionText } = req.body;
          if (!assignmentId || !studentId) {
            return res.status(400).json({ message: 'Missing required fields.' });
          }

          const newSubmission = new Submission({
            assignment_id: assignmentId,
            user_id: studentId,
            submission_file: req.file ? `/uploads/submissions/${req.file.filename}` : null,
            submission_text: submissionText || null,
            submitted_at: new Date()
          });

          await newSubmission.save();

          // notify teachers
          eventBus.emit('new_submission', {
            assignmentId,
            studentId,
          });

          res.status(201).json({
            message: 'Submission successful!',
            submission: newSubmission
          });
        } catch (error) {
          logger.error('Error submitting assignment:', error);
          res.status(500).json({ message: 'Server error' });
        }
      }
    );

    /**
     * @route GET /api/student/teachers/my-school
     * @desc Fetches all teachers from the same school as the logged-in student.
     * @access Private (Student Only)
     */
    router.get('/student/teachers/my-school', authenticateJWT, hasRole('student'), async (req, res) => {
        try {
            const student = await User.findById(req.user.id);
            if (!student || !student.school) {
                return res.status(400).json({ message: 'Student school information is missing.' });
            }
            const teachers = await User.find({
                role: 'teacher',
                school: student.school
            }).select('firstName lastName email'); // Select only necessary fields

            res.status(200).json({ teachers });
        } catch (error) {
            logger.error('Error fetching teachers for student\'s school:', error);
            res.status(500).json({ message: 'Server error' });
        }
    });



    // ✅ Attach all routes to the main app
    app.use('/api', router);
    router.get('/health', (req, res) => {
        res.status(200).json({ status: 'OK' });
    });

    // Return the router at the bottom
    return router;
};
