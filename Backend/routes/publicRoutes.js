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

  // ✅ Updated signup schema to include conditional fields
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
    grade: Joi.alternatives().try(
      Joi.number().integer().min(5).max(12),
      Joi.string().valid("100", "200", "300", "400", "500", "600")
    ).allow(null),
    teacherGrade: Joi.alternatives().try(
      Joi.number().integer().min(5).max(12),
      Joi.string().valid("100", "200", "300", "400", "500", "600")
    ).allow(null),
    // ----------------------------------------------------
    //  ✅ NEW: Added these fields to collect all data upfront
    // ----------------------------------------------------
    educationLevel: Joi.string()
      .valid("junior", "high", "university")
      .when('occupation', {
        is: 'student',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    university: Joi.string()
      .when('educationLevel', {
        is: 'university',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    uniLevel: Joi.string()
      .valid("100", "200", "300", "400")
      .when('educationLevel', {
        is: 'university',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    teacherSubject: Joi.string()
      .when('occupation', {
        is: 'teacher',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
  });

  const verifyOtpSchema = Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required(),
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[A-Z])(?=.*[!@#$%^&*])/)
      .message("Password must contain at least one uppercase and one special character")
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
      const { email, firstname, ...rest } = req.body;

      // ... existing code ...
      const code =
        process.env.NODE_ENV === "production"
          ? Math.floor(100000 + Math.random() * 900000).toString()
          : "123456";

      if (!req.session) req.session = {};
      req.session.signup = {
        ...rest,
        email,
        firstname,
        code,
        attempts: 0,
        timestamp: Date.now(),
      };

      logger.debug("[OTP] Generated for %s: %s", email, code);

      try {
        const success = await (async () => {
          const retries = 3;
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              await sendOTPEmail(email, firstname, code);
              logger.info("OTP email sent to %s (attempt %d)", email, attempt);
              return true;
            } catch (err) {
              logger.warn(
                "⚠️ OTP send attempt %d failed for %s: %s",
                attempt,
                email,
                err.message || err
              );
              if (attempt < retries) {
                const delay = Math.pow(2, attempt) * 1000;
                logger.debug("⏳ Retrying in %ds...", delay / 1000);
                await new Promise((r) => setTimeout(r, delay));
              }
            }
          }
          return false;
        })();

        if (!success) {
          logger.error("❌ All OTP send attempts failed for %s", email);
          return res.status(500).json({ error: "Failed to send OTP" });
        }

        const otpToken = jwt.sign(
          req.session.signup,
          JWT_SECRET,
          { expiresIn: "10m" }
        );

        eventBus.emit("otp_sent", { email, otp: code });
        res.json({
          step: "verify",
          message: "OTP sent to your email",
          otpToken
        });
      } catch (err) {
        logger.error("❌ Unexpected OTP route error:", err);
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
        // Decode the JWT token and verify its integrity
        const decoded = jwt.verify(otpToken, JWT_SECRET);

        // Verify that the email and OTP from the request match the token's payload
        if (decoded.email !== email || decoded.code !== code) {
          return res.status(400).json({ error: "Invalid email or OTP" });
        }

        // Check for an existing user with the same email or phone to prevent duplicates
        const existingUser = await User.findOne({
          $or: [{ email: decoded.email }, { phone: decoded.phone }]
        });
        if (existingUser) {
          return res.status(409).json({ error: "Email or phone already registered." });
        }

        // Hash the user's password for secure storage
        const hash = await bcrypt.hash(password, 10);

        // Set a 30-day trial period
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 30);

        // Construct the user data object from the decoded token payload
        // The token now contains all the necessary fields from the updated signupOtpSchema
        const userData = {
          firstname: decoded.firstname,
          lastname: decoded.lastname,
          email: decoded.email,
          phone: decoded.phone,
          occupation: decoded.occupation,
          schoolCountry: decoded.schoolCountry,
          schoolName: decoded.schoolName,
          educationLevel: decoded.educationLevel, // ✅ NEW: added this
          grade: decoded.grade,
          university: decoded.university, // ✅ NEW: added this
          uniLevel: decoded.uniLevel, // ✅ NEW: added this
          teacherGrade: decoded.teacherGrade,
          teacherSubject: decoded.teacherSubject, // ✅ NEW: added this
          password: hash, // Store the hashed password
          verified: true,
          role: decoded.occupation,
          is_on_trial: true,
          trial_end_date: trialEndDate,
          subscription_status: "inactive",
        };
        
        // Remove fields from userData that might be null
        Object.keys(userData).forEach(key => {
            if (userData[key] === null || typeof userData[key] === 'undefined') {
                delete userData[key];
            }
        });


        // Create the new user in the database. This is the operation that's failing.
        const newUser = await User.create(userData);

        // Send a welcome email to the newly created user
        await sendWelcomeEmail(newUser.email, newUser.firstname);

        // Emit a custom event for other parts of the application to listen to
        eventBus.emit("user_signed_up", {
          userId: newUser._id,
          email: newUser.email,
          occupation: newUser.occupation,
        });

        // Sign a new JWT token for the user session
        const token = jwt.sign(
          { id: newUser._id, email: newUser.email, role: newUser.role },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES }
        );

        // Set the access token in a secure HTTP-only cookie
        res.cookie("access_token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "None",
          maxAge: 1000 * 60 * 60 * 24,
        });

        // Send a success response back to the client
        res.status(201).json({
          status: "success",
          message: "Account created successfully.",
          token,
          user: { id: newUser._id, email: newUser.email, role: newUser.role },
        });
      } catch (err) {
        // Log the full error to the console for debugging
        logger.error("❌ Verify OTP error:", err);

        // Differentiate between known and unknown errors
        if (err.name === "TokenExpiredError") {
          return res.status(400).json({ error: "OTP expired" });
        } else if (err.name === "ValidationError") {
          // Mongoose validation error
          return res.status(400).json({
            error: "Account creation failed due to validation errors.",
            details: err.errors
          });
        } else if (err.code === 11000) {
          // Mongo duplicate key error
          return res
            .status(409)
            .json({ error: "Email or phone already registered." });
        } else {
          // Catch-all for any other unexpected server error
          res.status(500).json({ error: "Account creation failed." });
        }
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
        secure: true,
        sameSite: "None",
        maxAge: 1000 * 60 * 60 * 24,
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

  // --------------------
  // RESET PASSWORD
  // --------------------
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


publicRouter.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token and password are required." });
    }

    const resetToken = await ResetToken.findOne({ token }).populate("userId"); 
    if (!resetToken) {
      return res.status(400).json({ error: "Invalid or expired token." });
    }

    const strongPasswordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!strongPasswordRegex.test(password)) {
      return res.status(400).json({ error: "Password does not meet security requirements." });
    }

    
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = resetToken.userId;
    user.password = hashedPassword;
    await user.save();
    await resetToken.deleteOne();

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Server error." });
  }
});



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
