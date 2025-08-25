/* routes/publicRoutes.js – Hardened version with Brevo template emails & eventBus */
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const Joi = require("joi");
const User = require("../models/User");

// Brevo email utils
const {
  sendOTPEmail,
  sendWelcomeEmail,
  sendResetEmail,
  sendContactEmail,
} = require("../utils/email");

module.exports = (eventBus, agenda) => {
  const publicRouter = express.Router();

  /* -------------------------------
   * Joi Schemas
   * ----------------------------- */
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

    // student fields
    educationLevel: Joi.string().allow("", null),
    grade: Joi.number().integer().min(5).max(12).allow(null),
    schoolName: Joi.string().allow("", null), // ✅ added for students

    // teacher fields
    teacherSchool: Joi.string().allow("", null),
    teacherGrade: Joi.alternatives()
      .try(
        Joi.number().integer().min(5).max(12),
        Joi.string().valid("100", "200", "300", "400", "500", "600")
      )
      .allow(null),
    teacherSubject: Joi.string().allow("", null), // ✅ added for teachers

    // university fields
    university: Joi.string().allow("", null),
    uniLevel: Joi.string()
      .valid("100", "200", "300", "400", "500", "600")
      .allow("", null),
    program: Joi.string().allow("", null),

    // required
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
    if (error)
      return res
        .status(400)
        .json({
          message: "Validation failed",
          errors: error.details.map((d) => d.message),
        });
    next();
  };

  /* -------------------------------
   * Routes
   * ----------------------------- */

  // --- Signup: send OTP ---
  publicRouter.post(
    "/users/signup-otp",
    rateLimit({ windowMs: 5 * 60 * 1000, max: 3 }),
    validate(signupOtpSchema),
    async (req, res) => {
      const { phone, email, firstname } = req.body;
      const code =
        process.env.NODE_ENV === "production"
          ? Math.floor(100000 + Math.random() * 900000).toString()
          : "123456";
      req.session.signup = { ...req.body, code, timestamp: Date.now() };
      console.debug("[OTP] Generated for %s: %s", phone, code);

      try {
        await sendOTPEmail(email, code);

        // Emit event for logging or SMS
        eventBus.emit("otp_sent", { email, phone, otp: code });

        res.json({ step: "verify", message: "OTP sent to your email" });
      } catch (err) {
        console.error("❌ OTP send error:", err);
        res.status(500).json({ error: "Failed to send OTP" });
      }
    }
  );

  // --- Verify OTP / Create Account ---
  publicRouter.post(
    "/users/verify-otp",
    validate(verifyOtpSchema),
    async (req, res) => {
      const { code, email } = req.body;
      const signupData = req.session?.signup;
      if (!signupData || signupData.email !== email || signupData.code !== code)
        return res.status(400).json({ error: "Invalid OTP or email" });
      if (Date.now() - signupData.timestamp > 10 * 60 * 1000) {
        delete req.session.signup;
        return res.status(400).json({ error: "OTP expired" });
      }

      try {
        const hash = await bcrypt.hash(signupData.password, 10);
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 30);

        const newUser = await User.create({
          ...signupData,
          password: hash,
          verified: true,
          is_admin: signupData.occupation === "admin",
          role: signupData.occupation,
          schoolCountry: signupData.schoolCountry,
          is_on_trial: true,
          trial_end_date: trialEndDate,
          subscription_status: "inactive",
        });

        delete req.session.signup;

        // Send Welcome Email
        await sendWelcomeEmail(newUser.email, newUser.firstname);

        // Emit account created event
        eventBus.emit("user_signed_up", {
          userId: newUser._id,
          email: newUser.email,
          occupation: newUser.occupation,
        });

        res.status(201).json({ message: "Account created successfully." });
      } catch (err) {
        if (err.code === 11000)
          return res
            .status(409)
            .json({ error: "Email or phone already registered." });
        console.error("❌ Verify OTP error:", err);
        res.status(500).json({ error: "Account creation failed." });
      }
    }
  );

  // --- Forgot Password ---
  publicRouter.post(
    "/auth/forgot-password",
    validate(forgotPasswordSchema),
    async (req, res) => {
      const { email } = req.body;
      try {
        const user = await User.findOne({ email });
        if (!user)
          return res
            .status(200)
            .json({
              message: "If an account exists, a reset link has been sent.",
            });

        const token = crypto.randomBytes(32).toString("hex");
        user.reset_password_token = token;
        user.reset_password_expires = Date.now() + 3600000;
        await user.save();

        const resetLink = `${req.protocol}://${req.get(
          "host"
        )}/reset-password.html?token=${token}`;
        await sendResetEmail(user.email, resetLink);

        // Emit event for possible notifications
        eventBus.emit("password_reset_requested", {
          userId: user._id,
          email: user.email,
        });

        res
          .status(200)
          .json({
            message: "If an account exists, a reset link has been sent.",
          });
      } catch (err) {
        console.error("❌ Forgot password error:", err);
        res.status(500).json({ error: "Server error" });
      }
    }
  );

/ POST /users/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required." });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid email or password." });

    // ✅ Generate JWT
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES / 1000 } // seconds
    );

    // ✅ Generate CSRF token
    const csrfToken = crypto.randomBytes(24).toString("hex");

    // ✅ Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: JWT_EXPIRES,
    });

    // ✅ Return minimal user info + CSRF
    res.json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      csrfToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login." });
  }
});

  // --- Reset Password ---
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
        if (!user)
          return res
            .status(400)
            .json({ message: "Password reset token is invalid or expired." });

        user.password = await bcrypt.hash(newPassword, 10);
        user.reset_password_token = undefined;
        user.reset_password_expires = undefined;
        await user.save();

        res.status(200).json({ message: "Password successfully reset." });
      } catch (err) {
        console.error("❌ Reset password error:", err);
        res.status(500).json({ error: "Server error" });
      }
    }
  );

  // --- Contact Form ---
  publicRouter.post("/contact", validate(contactSchema), async (req, res) => {
    const { name, email, message } = req.body;
    try {
      await sendContactEmail(
        "evansbuckman1@gmail.com",
        `New Contact Form Message from ${name}`,
        `<p><strong>Name:</strong>${name}</p><p><strong>Email:</strong>${email}</p><p><strong>Message:</strong><br>${message}</p>`
      );
      res
        .status(200)
        .json({ message: "Your message has been sent successfully." });
    } catch (err) {
      console.error("❌ Contact form error:", err);
      res.status(500).json({ error: "Failed to send message." });
    }
  });

  return publicRouter;
};
