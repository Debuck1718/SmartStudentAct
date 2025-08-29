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
    phone: Joi.string().pattern(/^\d{10,15}$/).required(),
    email: Joi.string().email().required(),
    firstname: Joi.string().min(2).max(50).required(),
    lastname: Joi.string().min(2).max(50).required(),
    occupation: Joi.string()
      .valid("student", "teacher", "admin", "global_overseer", "overseer")
      .required(),
    schoolCountry: Joi.string().length(2).required(),
    schoolName: Joi.string().max(100).required(),
    grade: Joi.alternatives()
      .try(
        Joi.number().integer().min(5).max(12),
        Joi.string().valid("100", "200", "300", "400", "500", "600")
      )
      .allow(null),
    teacherGrade: Joi.alternatives()
      .try(
        Joi.number().integer().min(5).max(12),
        Joi.string().valid("100", "200", "300", "400", "500", "600")
      )
      .allow(null),
  });

  const verifyOtpSchema = Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required(),
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[A-Z])(?=.*[!@#$%^&*])/)
      .message(
        "Password must contain at least one uppercase and one special character"
      )
      .required(),
    otpToken: Joi.string().required(),
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


  publicRouter.post(
    "/users/signup-otp",
    rateLimit({ windowMs: 5 * 60 * 1000, max: 5 }),
    validate(signupOtpSchema),
    async (req, res) => {
      const { email, firstname } = req.body;

      const code =
        process.env.NODE_ENV === "production"
          ? Math.floor(100000 + Math.random() * 900000).toString()
          : "123456";

      logger.debug("[OTP] Generated for %s: %s", email, code);

      try {
        await sendOTPEmail(email, firstname, code);

        const otpToken = jwt.sign(
          { ...req.body, code },
          JWT_SECRET,
          { expiresIn: "10m" }
        );

        eventBus.emit("otp_sent", { email, otp: code });

        res.json({
          step: "verify",
          message: "OTP sent to your email",
          otpToken,
        });
      } catch (err) {
        logger.error("❌ OTP route error:", err);
        res.status(500).json({ error: "Failed to send OTP" });
      }
    }
  );


  publicRouter.post(
    "/users/verify-otp",
    rateLimit({ windowMs: 5 * 60 * 1000, max: 5 }),
    validate(verifyOtpSchema),
    async (req, res) => {
      const { code, email, password, otpToken } = req.body;

      try {
        const decoded = jwt.verify(otpToken, JWT_SECRET);

        if (decoded.email !== email || decoded.code !== code) {
          return res.status(400).json({ error: "Invalid email or OTP" });
        }


        const hash = await bcrypt.hash(password, 10);

        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 30);

        const newUser = await User.create({
          firstname: decoded.firstname,
          lastname: decoded.lastname,
          email: decoded.email,
          phone: decoded.phone,
          occupation: decoded.occupation,
          schoolCountry: decoded.schoolCountry,
          schoolName: decoded.schoolName,
          grade: decoded.grade || null,
          teacherGrade: decoded.teacherGrade || null,
          password: hash,
          verified: true,
          role: decoded.occupation,
          is_on_trial: true,
          trial_end_date: trialEndDate,
          subscription_status: "inactive",
        });


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
        if (err.name === "TokenExpiredError") {
          return res.status(400).json({ error: "OTP expired" });
        }
        if (err.code === 11000) {
          return res
            .status(409)
            .json({ error: "Email or phone already registered." });
        }
        logger.error("❌ Verify OTP error:", err);
        res.status(500).json({ error: "Account creation failed." });
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

