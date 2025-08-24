// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstname: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    lastname: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    phone: {
      type: String,
      unique: true,
      sparse: true, // allows some users without phone
      trim: true,
      match: [/^\+?[0-9]{7,15}$/, "Invalid phone number"],
    },
    password: {
      type: String,
      required: true,
      select: false,
      minlength: 8,
    },
    occupation: {
      type: String,
      enum: ["student", "teacher", "admin"],
      required: true,
    },

    // --- Student fields ---
    educationLevel: {
      type: String,
      enum: ["junior", "high", "university"],
      required: function () {
        return this.occupation === "student";
      },
    },
    grade: {
      type: Number,
      min: 1,
      max: 12,
      required: function () {
        return this.occupation === "student" && this.educationLevel !== "university";
      },
    },
    schoolName: {
      type: String,
      trim: true,
      maxlength: 100,
      required: function () {
        return this.occupation === "student";
      },
    },
    university: {
      type: String,
      trim: true,
      maxlength: 150,
      required: function () {
        return this.occupation === "student" && this.educationLevel === "university";
      },
    },
    uniLevel: {
      type: String,
      enum: ["100", "200", "300", "400"],
      required: function () {
        return this.occupation === "student" && this.educationLevel === "university";
      },
    },
    program: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    // --- Teacher fields ---
    teacherSchool: {
      type: String,
      trim: true,
      maxlength: 100,
      required: function () {
        return this.occupation === "teacher";
      },
    },
    teacherGrade: {
      type: mongoose.Schema.Types.Mixed, // can be number or string (e.g., "200")
      required: function () {
        return this.occupation === "teacher";
      },
    },
    teacherSubject: {
      type: String,
      trim: true,
      maxlength: 100,
      required: function () {
        return this.occupation === "teacher";
      },
    },

    // --- Auth / verification ---
    verified: { type: Boolean, default: false },
    is_admin: { type: Boolean, default: false },
    role: { type: String, required: true }, // system role vs occupation

    // --- OTP / Security ---
    otpHash: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
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
      },
    },
    subscription_status: {
      type: String,
      enum: ["inactive", "active", "expired"],
      default: "inactive",
    },
    payment_gateway: { type: String, trim: true },
    payment_date: Date,

    // --- Overseer role ---
    managedRegions: {
      type: [String],
      default: [],
    },

    // --- School's country ---
    schoolCountry: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    // --- Gamification / goal setting ---
    earnedBadges: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// 🔒 Ensure sensitive fields never leak via JSON
userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.otpHash;
    delete ret.otpExpiry;
    delete ret.reset_password_token;
    delete ret.reset_password_expires;
    return ret;
  },
});

// 📌 Indexing for faster queries
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });

module.exports = mongoose.model("User", userSchema);
