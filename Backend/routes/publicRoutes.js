const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const Joi = require("joi");
const User = require("../models/User");
const logger = require("../utils/logger");

const {
  sendOTPEmail,
  sendWelcomeEmail,
  sendResetEmail,
  sendContactEmail,
} = require("../utils/email");

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "1d";

module.exports = (eventBus, agenda) => {
  const publicRouter = express.Router();

  const signupOtpSchema = Joi.object({
    phone: Joi.string()
      .pattern(/^\d{10,15}$/)
      .required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    firstname: Joi.string().min(2).max(50).required(),
    lastname: Joi.string().min(2).max(50).required(),
    occupation: Joi.string()
      .valid("student", "teacher", "admin", "global_overseer", "overseer")
      .required(),
    educationLevel: Joi.string().allow("", null),
    grade: Joi.number().integer().min(5).max(12).allow(null),
    schoolName: Joi.string().allow("", null),
    teacherSchool: Joi.string().allow("", null),
    teacherGrade: Joi.alternatives()
      .try(
        Joi.number().integer().min(5).max(12),
        Joi.string().valid("100", "200", "300", "400", "500", "600")
      )
      .allow(null),
    teacherSubject: Joi.string().allow("", null),
    university: Joi.string().allow("", null),
    uniLevel: Joi.string()
      .valid("100", "200", "300", "400", "500", "600")
      .allow("", null),
    program: Joi.string().allow("", null),
    schoolCountry: Joi.string().length(2).required(),
  }).unknown(true);

  const verifyOtpSchema = Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required(),
    email: Joi.string().email().required(),
    newPassword: Joi.string().min(8).optional(),
  });

  const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });

  const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
  });

  const resetPasswordSchema = Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(8).required(),
  });

  const contactSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    message: Joi.string().min(5).max(2000).required(),
  });

  const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((d) => d.message),
      });
    }
    next();
  };
// Signup OTP route
publicRouter.post(
  "/users/signup-otp",
  rateLimit({ windowMs: 5 * 60 * 1000, max: 5 }), // max 5 requests per 5 min
  validate(Joi.object({
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\d{10,15}$/).required()
  })),
  async (req, res) => {
    const { email, phone } = req.body;
    const code =
      process.env.NODE_ENV === "production"
        ? Math.floor(100000 + Math.random() * 900000).toString()
        : "123456";

    // Initialize session safely
    if (!req.session) req.session = {};
    req.session.signup = {
      email,
      phone,
      code,
      attempts: 0,
      timestamp: Date.now(),
    };

    logger.debug("[OTP] Generated for %s: %s", phone, code);

    try {
      await sendOTPEmail(email, code);
      eventBus.emit("otp_sent", { email, phone, otp: code });
      res.json({ step: "verify", message: "OTP sent to your email" });
    } catch (err) {
      logger.error("❌ OTP send error:", err);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  }
);

// Verify OTP route
publicRouter.post(
  "/users/verify-otp",
  rateLimit({ windowMs: 5 * 60 * 1000, max: 5 }), // max 5 attempts per 5 min
  validate(Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().length(6).pattern(/^\d+$/).required(),
    password: Joi.string().min(8).required(),
    firstname: Joi.string().min(2).max(50).required(),
    lastname: Joi.string().min(2).max(50).required(),
    occupation: Joi.string()
      .valid("student", "teacher", "admin", "global_overseer", "overseer")
      .required(),
    schoolCountry: Joi.string().length(2).required(),
    educationLevel: Joi.string().allow("", null),
    grade: Joi.number().integer().min(5).max(12).allow(null),
    schoolName: Joi.string().allow("", null),
    teacherSchool: Joi.string().allow("", null),
    teacherGrade: Joi.alternatives().try(
      Joi.number().integer().min(5).max(12),
      Joi.string().valid("100","200","300","400","500","600")
    ).allow(null),
    teacherSubject: Joi.string().allow("", null),
    university: Joi.string().allow("", null),
    uniLevel: Joi.string().valid("100","200","300","400","500","600").allow("", null),
    program: Joi.string().allow("", null),
  })),
  async (req, res) => {
    const { email, code, ...signupFields } = req.body;
    const signupData = req.session?.signup;

    if (!signupData || signupData.email !== email) {
      return res.status(400).json({ error: "Invalid email or OTP session expired" });
    }

    // Limit OTP attempts
    signupData.attempts = (signupData.attempts || 0) + 1;
    if (signupData.attempts > 5) {
      delete req.session.signup;
      return res.status(429).json({ error: "Too many attempts, please request a new OTP" });
    }

    if (signupData.code !== code) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (Date.now() - signupData.timestamp > 10 * 60 * 1000) {
      delete req.session.signup;
      return res.status(400).json({ error: "OTP expired" });
    }

    try {
      const hash = await bcrypt.hash(signupFields.password, 10);
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      const newUser = await User.create({
        ...signupFields,
        email,
        phone: signupData.phone,
        password: hash,
        verified: true,
        is_admin: signupFields.occupation === "admin",
        role: signupFields.occupation,
        schoolCountry: signupFields.schoolCountry,
        is_on_trial: true,
        trial_end_date: trialEndDate,
        subscription_status: "inactive",
      });

      delete req.session.signup;

      await sendWelcomeEmail(newUser.email, newUser.firstname);
      eventBus.emit("user_signed_up", {
        userId: newUser._id,
        email: newUser.email,
        occupation: newUser.occupation,
      });

      const token = jwt.sign(
        { id: newUser._id, email: newUser.email, role: newUser.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      res.cookie("access_token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 1000 * 60 * 60 * 24,
      });

      res.status(201).json({
        status: "success",
        message: "Account created successfully.",
        token,
        user: { id: newUser._id, email: newUser.email, role: newUser.role },
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: "Email or phone already registered." });
      }
      logger.error("❌ Verify OTP error:", err);
      res.status(500).json({ error: "Account creation failed." });
    }
  }
);



  publicRouter.post("/users/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ status: false, message: "Email and password are required." });
      }

      const user = await User.findOne({ email }).select("+password");
      if (!user) {
        return res
          .status(401)
          .json({ status: false, message: "Invalid credentials." });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ status: false, message: "Invalid credentials." });
      }

      const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.cookie("access_token", token, {
        httpOnly: true,
        secure: true, // true in production
        sameSite: "None", // allows cross-site requests if needed
        maxAge: 1000 * 60 * 60 * 24, // 1 day
      });
      res.json({
        status: true,
        message: "Login successful",
        user: {
          email: user.email,
          role: user.role,
          id: user._id,
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ status: false, message: "Server error" });
    }
  });

  publicRouter.post(
    "/auth/forgot-password",
    validate(forgotPasswordSchema),
    async (req, res) => {
      const { email } = req.body;
      try {
        const user = await User.findOne({ email });
        if (!user) {
          return res.status(200).json({
            message: "If an account exists, a reset link has been sent.",
          });
        }

        const token = crypto.randomBytes(32).toString("hex");
        user.reset_password_token = token;
        user.reset_password_expires = Date.now() + 3600000;
        await user.save();

        const resetLink = `${req.protocol}://${req.get(
          "host"
        )}/reset-password.html?token=${token}`;
        await sendResetEmail(user.email, resetLink);

        eventBus.emit("password_reset_requested", {
          userId: user._id,
          email: user.email,
        });
        res.status(200).json({
          message: "If an account exists, a reset link has been sent.",
        });
      } catch (err) {
        logger.error("❌ Forgot password error:", err);
        res.status(500).json({ error: "Server error" });
      }
    }
  );

  publicRouter.post(
    "/auth/reset-password",
    validate(resetPasswordSchema),
    async (req, res) => {
      const { token, newPassword } = req.body;
      try {
        const user = await User.findOne({
          reset_password_token: token,
          reset_password_expires: { $gt: Date.now() },
        });
        if (!user) {
          return res.status(400).json({
            message: "Password reset token is invalid or expired.",
          });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.reset_password_token = undefined;
        user.reset_password_expires = undefined;
        await user.save();

        res.status(200).json({ message: "Password successfully reset." });
      } catch (err) {
        logger.error("❌ Reset password error:", err);
        res.status(500).json({ error: "Server error" });
      }
    }
  );

  publicRouter.post("/contact", validate(contactSchema), async (req, res) => {
    const { name, email, message } = req.body;
    try {
      await sendContactEmail(
        "evansbuckman1@gmail.com",
        `New Contact Form Message from ${name}`,
        `<p><strong>Name:</strong> ${name}</p>
         <p><strong>Email:</strong> ${email}</p>
         <p><strong>Message:</strong><br>${message}</p>`
      );
      res
        .status(200)
        .json({ message: "Your message has been sent successfully." });
    } catch (err) {
      logger.error("❌ Contact form error:", err);
      res.status(500).json({ error: "Failed to send message." });
    }
  });

  return publicRouter;
};
