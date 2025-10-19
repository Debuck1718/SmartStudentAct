import mongoose from "mongoose";
import bcrypt from "bcrypt";

const BCRYPT_SALT_ROUNDS = 10;

// Prevent model overwrite issues on Vercel (serverless)
const existingModel = mongoose.models.User;

if (!existingModel) {
  const userSchema = new mongoose.Schema(
    {
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
        enum: ["student", "teacher", "admin", "overseer", "global_overseer", "worker"],
        required: true,
      },

      refreshToken: { type: String, select: false },

      occupation: {
        type: String,
        enum: ["student", "teacher", "admin", "worker"],
        required: true,
      },

      country: {
        type: String,
        required: function () {
          return this.occupation === "worker";
        },
        trim: true,
        maxlength: 100,
      },

      educationLevel: {
        type: String,
        enum: ["junior", "high", "university"],
        required: function () {
          return this.occupation === "student" && this.educationLevel;
        },
      },
      grade: {
        type: Number,
        min: 1,
        max: 12,
        required: function () {
          return this.occupation === "student" && this.educationLevel !== "university" && this.grade;
        },
      },
      university: {
        type: String,
        trim: true,
        maxlength: 150,
        required: function () {
          return this.occupation === "student" && this.educationLevel === "university" && this.university;
        },
      },
      uniLevel: {
        type: String,
        enum: ["100", "200", "300", "400"],
        required: function () {
          return this.occupation === "student" && this.educationLevel === "university" && this.uniLevel;
        },
      },
      program: { type: String, trim: true, maxlength: 100 },

      teacherGrade: {
        type: [String],
        required: function () {
          return this.occupation === "teacher" && this.teacherGrade && this.teacherGrade.length > 0;
        },
      },
      teacherSubject: {
        type: String,
        trim: true,
        maxlength: 100,
        required: function () {
          return this.occupation === "teacher" && this.teacherSubject;
        },
      },

      school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "School",
        required: function () {
          return ["student", "teacher", "admin"].includes(this.occupation) && this.school;
        },
      },

      verified: { type: Boolean, default: false },
      otpHash: { type: String, select: false },
      otpExpiry: { type: Date, select: false },
      failedLoginAttempts: { type: Number, default: 0 },
      lockoutUntil: { type: Date, default: null },
      reset_password_token: { type: String, select: false },
      reset_password_expires: { type: Date, select: false },

      is_on_trial: {
        type: Boolean,
        default: function () {
          return !["overseer", "global_overseer"].includes(this.role);
        },
      },
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
      earnedBadges: { type: [String], default: [] },
      trialInsightsUsed: { type: Number, default: 0 },
      trialInsightsLimit: { type: Number, default: 3 },
    },
    { timestamps: true }
  );

  userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    try {
      const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (err) {
      next(err);
    }
  });

  userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

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

  mongoose.model("User", userSchema);
}

export default mongoose.models.User;
