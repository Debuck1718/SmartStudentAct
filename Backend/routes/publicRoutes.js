const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const Joi = require("joi");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const logger = require("../utils/logger");
const { sendOTPEmail, sendWelcomeEmail } = require("../utils/email");

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";

module.exports = (eventBus) => {
  const publicRouter = express.Router();


  const signupOtpSchema = Joi.object({
    phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .required(),
    email: Joi.string().email().required(),
    firstname: Joi.string().min(2).max(50).required(),
    lastname: Joi.string().min(2).max(50).required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/)
      .message(
        "Password must be at least 8 characters, with one uppercase, one number, one special char."
      )
      .required(),
    confirmPassword: Joi.string().valid(Joi.ref("password")).required(),
    occupation: Joi.string().valid("student", "teacher").required(),
    schoolName: Joi.string().allow(""),
    schoolCountry: Joi.string().allow(""),
    educationLevel: Joi.string().allow(""),
    grade: Joi.string().allow(""),
  });

  const verifyOtpSchema = Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required(),
    email: Joi.string().email().required(),
    password: Joi.string().required(),
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
    try {
      const {
        firstname,
        lastname,
        email,
        phone,
        password,
        occupation,
        schoolName,
        schoolCountry,
        educationLevel,
        grade,
      } = req.body;

      let existingUser = await User.findOne({ email });

      if (existingUser) {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const otpToken = jwt.sign(
          { email, code },
          JWT_SECRET,
          { expiresIn: "10m" }
        );

        await sendOTPEmail(email, firstname, code);

        return res.json({
          status: "success",
          message: "OTP sent to existing user.",
          otpToken,
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const temporaryUserId = uuidv4();

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const otpToken = jwt.sign(
        {
          temporaryUserId,
          firstname,
          lastname,
          email,
          phone,
          passwordHash,
          occupation,
          schoolName,
          schoolCountry,
          educationLevel,
          grade,
          code,
        },
        JWT_SECRET,
        { expiresIn: "10m" }
      );

      await sendOTPEmail(email, code, existingUser.firstname);

      res.status(200).json({
        status: "success",
        message: "OTP sent. Please verify to complete signup.",
        otpToken,
      });
    } catch (err) {
      logger.error("❌ Signup-OTP error:", err);
      res.status(500).json({ message: "Signup failed." });
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
        return res.status(400).json({ message: "Invalid email or OTP." });
      }

      let user = await User.findOne({ email });

      if (user) {
        let isMatch = false;
        if (user.password) {
          isMatch = await bcrypt.compare(password, user.password);
        }

        if (!isMatch) {
          const newHashed = await bcrypt.hash(password, 10);
          user.password = newHashed;
          await user.save();
        }

        const token = jwt.sign(
          { id: user._id, role: user.occupation },
          JWT_SECRET,
          { expiresIn: "1d" }
        );

        res.cookie("access_token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "None",
          maxAge: 1000 * 60 * 60 * 24,
        });

        const redirectUrl = getRedirectUrl(user.occupation);

        return res.status(200).json({
          status: "success",
          message: "User verified. Redirecting...",
          redirectUrl, 
        });
      } else {
        const requiredFields = ['temporaryUserId', 'firstname', 'lastname', 'email', 'occupation', 'schoolName', 'schoolCountry', 'passwordHash'];
        const missingFields = requiredFields.filter(field => decoded[field] === undefined);

        if (missingFields.length > 0) {
          return res.status(400).json({
            message: "Incomplete user data in OTP token. Please restart signup.",
          });
        }

        const newUser = new User({
          _id: decoded.temporaryUserId,
          firstname: decoded.firstname,
          lastname: decoded.lastname,
          email: decoded.email,
          phone: decoded.phone,
          password: decoded.passwordHash,
          verified: true,
          role: decoded.occupation,
          occupation: decoded.occupation,
          educationLevel: decoded.educationLevel,
          grade: decoded.grade,
          schoolName: decoded.schoolName,
          schoolCountry: decoded.schoolCountry,
        });

        await newUser.save();

        const token = jwt.sign(
          { id: newUser._id, role: newUser.occupation },
          JWT_SECRET,
          { expiresIn: "1d" }
        );

        res.cookie("access_token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "None",
          maxAge: 1000 * 60 * 60 * 24,
        });

        const redirectUrl = getRedirectUrl(newUser.occupation);

        sendWelcomeEmail(newUser.email, newUser.firstname).catch((e) =>
          console.error("Failed to send welcome email:", e)
        );

        return res.status(201).json({
          status: "success",
          message: "User created & verified. Redirecting...",
          redirectUrl, 
        });
      }
    } catch (err) {
      console.error("❌ Verify-OTP error:", err);
      if (err.name === "TokenExpiredError")
        return res.status(400).json({ message: "OTP expired." });
      return res.status(500).json({ message: "OTP verification failed." });
    }
  }
);

function getRedirectUrl(role) {
  switch (role) {
    case "global_overseer":
      return "/global_overseer.html";
    case "overseer":
      return "/overseer.html";
    case "admin":
      return "/admin.html";
    case "teacher":
      return "/teachers.html";
    case "student":
      return "/students.html";
    default:
      return "/login.html";
  }
}


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

      // Set the HttpOnly cookie
      res.cookie("access_token", token, {
        httpOnly: true,
        secure: true, // Only send over HTTPS
        sameSite: "None", // Required for cross-site requests
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
      });
      
      // Determine the redirect URL based on the user's role
      let redirectUrl;
      switch (user.role) {
        case "global_overseer":
          redirectUrl = "/global_overseer.html";
          break;
        case "overseer":
          redirectUrl = "/overseer.html";
          break;
        case "admin":
          redirectUrl = "/admin.html";
          break;
        case "teacher":
          redirectUrl = "/teachers.html";
          break;
        case "student":
          redirectUrl = "/students.html";
          break;
        default:
          redirectUrl = "/login.html";
      }

      // Send the user data and the redirect URL back to the client
      res.json({
        status: true,
        message: "Login successful",
        user: {
          email: user.email,
          role: user.role,
          id: user._id,
        },
        redirectUrl,
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
        return res
          .status(400)
          .json({ error: "Token and password are required." });
      }

      const resetToken = await ResetToken.findOne({ token }).populate("userId");
      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired token." });
      }

      const strongPasswordRegex =
        /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
      if (!strongPasswordRegex.test(password)) {
        return res
          .status(400)
          .json({ error: "Password does not meet security requirements." });
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
