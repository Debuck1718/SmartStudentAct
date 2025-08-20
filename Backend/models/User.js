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
  role: String,
  brevoOtp: String, // Store OTP
  brevoOtpExpiry: Date, // Store expiry timestamp

  // --- Fields for subscription management ---
  is_on_trial: { type: Boolean, default: true }, // Tracks if the user is on a free trial
  trial_end_date: { type: Date, default: () => {
    // Default to 30 days from creation, which is a common trial length.
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }}, // End date of the free trial
  subscription_status: { type: String, enum: ['inactive', 'active', 'expired'], default: 'inactive' }, // User's current subscription status
  payment_gateway: String, // Stores the payment gateway used (e.g., 'paystack')
  payment_date: Date, // Stores the date of the last successful payment

  // --- Field for Overseer role ---
  managedRegions: {
    type: [String],
    default: []
  },

  // --- Field for the school's country ---
  schoolCountry: {
    type: String,
    required: true // Making this field required for new signups
  },

  // --- New field to store earned badges for goal setting ---
  earnedBadges: {
    type: [String],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
