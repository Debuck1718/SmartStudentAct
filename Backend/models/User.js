const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstname: String,
  lastname: String,
  email: { type: String, unique: true, required: true },
  phone: { type: String, unique: true, sparse: true }, // Added phone field
  password: { type: String, select: false }, // Use 'select: false' to prevent password from being returned by default
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
  role: { type: String, required: true }, // Ensure role is always set
  brevoOtp: String, // Store OTP
  brevoOtpExpiry: Date, // Store expiry timestamp

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

