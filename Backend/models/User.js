const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstname: String,
    lastname: String,
    email: { type: String, unique: true, required: true },
    phone: { type: String, unique: true, sparse: true },
    password: { type: String, select: false },
    occupation: String,
    educationLevel: String,
    grade: Number,
    schoolName: String,
    teacherSchool: String,
    university: String,
    uniLevel: String,
    program: String,
    verified: { type: Boolean, default: false },
    is_admin: { type: Boolean, default: false },
    role: { type: String, required: true },
    
    // --- Updated OTP fields for security ---
    otpHash: String, // Stores the SHA256 hash of the OTP
    otpExpiry: Date, // Stores the expiry timestamp

    // --- New fields for brute-force protection ---
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },

    // --- New fields for password reset functionality ---
    reset_password_token: { type: String, select: false }, // Store hashed token
    reset_password_expires: { type: Date, select: false }, // Store expiry time

    // --- Fields for subscription management ---
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

    // --- Field for Overseer role ---
    managedRegions: {
        type: [String],
        default: []
    },

    // --- Field for the school's country ---
    schoolCountry: {
        type: String,
        required: function () {
            return ['student', 'teacher', 'admin'].includes(this.role);
        }
    },

    // --- New field to store earned badges for goal setting ---
    earnedBadges: {
        type: [String],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
