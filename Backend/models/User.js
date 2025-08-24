const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstname: String,
    lastname: String,
    email: { type: String, unique: true, required: true },
    phone: { type: String, unique: true, sparse: true },
    password: { type: String, select: false },
    occupation: { type: String, enum: ['student', 'teacher', 'admin'], required: true },

    // --- Student fields ---
    educationLevel: String, // junior, high, university
    grade: Number,          // e.g., 5, 6, 12
    schoolName: String,     // for students
    university: String,     // for university students
    uniLevel: String,       // e.g., "100", "200"
    program: String,        // program of study

    // --- Teacher fields ---
    teacherSchool: String,  
    teacherGrade: mongoose.Schema.Types.Mixed, // number (5–12) or string ("100", "200")
    teacherSubject: String, // NEW: subject taught

    // --- Auth / verification ---
    verified: { type: Boolean, default: false },
    is_admin: { type: Boolean, default: false },
    role: { type: String, required: true },

    // --- OTP / Security ---
    otpHash: String, 
    otpExpiry: Date,
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },

    // --- Password reset ---
    reset_password_token: { type: String, select: false },
    reset_password_expires: { type: Date, select: false },

    // --- Subscription management ---
    is_on_trial: { type: Boolean, default: true }, 
    trial_end_date: { 
        type: Date, 
        default: () => {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            return date;
        }
    },
    subscription_status: { 
        type: String, 
        enum: ['inactive', 'active', 'expired'], 
        default: 'inactive' 
    },
    payment_gateway: String, 
    payment_date: Date, 

    // --- Overseer role ---
    managedRegions: {
        type: [String],
        default: []
    },

    // --- School's country ---
    schoolCountry: {
        type: String,
        required: function () {
            return ['student', 'teacher', 'admin'].includes(this.role);
        }
    },

    // --- Gamification / goal setting ---
    earnedBadges: {
        type: [String],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

