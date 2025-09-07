const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const BCRYPT_SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    firstname: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    lastname: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    phone: { type: String, unique: true, sparse: true, trim: true, match: [/^\+?[0-9]{7,15}$/, "Invalid phone number"] },
    password: { type: String, required: true, minlength: 8, select: false },
    role: {
      type: String,
      enum: ["student", "teacher", "admin", "overseer", "global_overseer"],
      required: true,
    },
    refreshToken: { type: String, select: false },
    occupation: {
      type: String,
      enum: ["student", "teacher", "admin"],
      required: function () {
        return ["student", "teacher", "admin"].includes(this.role);
      },
    },
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
        return ["student", "teacher", "admin"].includes(this.occupation);
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
    program: { type: String, trim: true, maxlength: 100 },
    teacherGrade: {
      type: [String],
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
    verified: { type: Boolean, default: false },
    otpHash: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
    reset_password_token: { type: String, select: false },
    reset_password_expires: { type: Date, select: false },
    is_on_trial: { type: Boolean, default: function () { return !["overseer", "global_overseer"].includes(this.role); } },
    trial_end_at: {
      type: Date,
      default: function () {
        if (["overseer", "global_overseer"].includes(this.role)) return null;
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
      },
    },
    subscription_status: {
      type: String,
      enum: ["inactive", "active", "expired"],
      default: function () {
        return ["overseer", "global_overseer"].includes(this.role) ? "active" : "inactive";
      },
    },
    payment_gateway: {
      type: String,
      trim: true,
      required: function () {
        return !["overseer", "global_overseer"].includes(this.role) && !this.is_on_trial;
      },
    },
    payment_date: {
      type: Date,
      required: function () {
        return !["overseer", "global_overseer"].includes(this.role) && !this.is_on_trial;
      },
    },
    managedRegions: { type: [String], default: [] },
    schoolCountry: {
      type: String,
      required: function () {
        return ["student", "teacher", "admin"].includes(this.role);
      },
      trim: true,
      maxlength: 100,
    },
    earnedBadges: { type: [String], default: [] },
    trialInsightsUsed: { type: Number, default: 0 },
    trialInsightsLimit: { type: Number, default: 3 },
  },
  { timestamps: true }
);

// --- Always hash password, avoid double hashing ---
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  if (this._rawPassword) {
    this.password = this._rawPassword; // already hashed
    delete this._rawPassword;
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// --- Compare password ---
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// --- Transform JSON output ---
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

// --- Helper to set raw hashed password safely ---
userSchema.methods.setRawHashedPassword = function (hashedPassword) {
  this._rawPassword = hashedPassword;
  this.password = hashedPassword;
};

module.exports = mongoose.model("User", userSchema);

