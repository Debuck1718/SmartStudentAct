const express = require("express");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const Joi = require("joi");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");
const {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} = require("../middlewares/auth");

const {
  sendOTPEmail,
  sendWelcomeEmail,
  sendResetEmail,
  sendContactEmail,
} = require("../utils/email");

const CONTACT_EMAIL = process.env.CONTACT_EMAIL;
const IS_PROD = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD_RESET_EXPIRY = 3600000; 

if (!JWT_SECRET)
  throw new Error("JWT_SECRET is not defined in environment variables.");

module.exports = (eventBus) => {
  const publicRouter = express.Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message:
      "Too many login attempts from this IP, please try again after 15 minutes.",
  });

  const generalLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 1000,
    message: "Too many requests from this IP, please try again after an hour.",
  });

  const redirectPaths = {
    global_overseer: "/global_overseer.html",
    overseer: "/overseer.html",
    admin: "/admins.html",
    teacher: "/teachers.html",
    student: "/students.html",
    payment: "/payment.html",
    default: "/login.html",
  };

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
  schoolName: Joi.string().required(),
  schoolCountry: Joi.string().required(),
  educationLevel: Joi.string().when("occupation", {
    is: "student",
    then: Joi.required(),
    otherwise: Joi.allow(""),
  }),
  grade: Joi.string().when("occupation", {
    is: "student",
    then: Joi.required(),
    otherwise: Joi.allow(""),
  }),
  teacherGrade: Joi.string().when("occupation", {
    is: "teacher",
    then: Joi.required(),
    otherwise: Joi.allow(""),
  }),
  teacherSubject: Joi.string().when("occupation", {
    is: "teacher",
    then: Joi.required(),
    otherwise: Joi.allow(""),
  }),
  program: Joi.string().when("occupation", {
    is: "student",
    then: Joi.required(),
    otherwise: Joi.allow(""),
  }),
});


  const verifyOtpSchema = Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required(),
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    otpToken: Joi.string().required(),
  });

  const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/)
      .required(),
  });

  const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
  });

  const resetPasswordSchema = Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/)
      .required(),
  });

  const contactSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    message: Joi.string().min(5).max(2000).required(),
  });

  const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      logger.error("Validation failed", { errors: error.details });
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
        teacherGrade,
        teacherSubject,
        program, 
      } = req.body;

      logger.info("Signup OTP request payload:", req.body);

      const existingUser = await User.findOne({ email });

      const otpTokenPayload = {
        temporaryUserId: crypto.randomUUID(),
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
        teacherGrade,
        teacherSubject,
        program, 
        code: Math.floor(100000 + Math.random() * 900000).toString(),
      };

      const otpToken = jwt.sign(otpTokenPayload, JWT_SECRET, { expiresIn: "10m" });
      await sendOTPEmail(email, firstname, otpTokenPayload.code);

      return res.status(200).json({
        status: "success",
        message: existingUser
          ? "OTP sent to existing user."
          : "OTP sent. Please verify to complete signup.",
        otpToken,
      });
    } catch (err) {
      logger.error("❌ Signup-OTP error:", err);
      res.status(500).json({ message: "Signup failed." });
    }
  }
);


 
  publicRouter.post("/users/verify-otp", validate(verifyOtpSchema), async (req, res) => {
    const { code, email, password, otpToken } = req.body;

    try {
      const decoded = jwt.verify(otpToken, JWT_SECRET);
      logger.info("Decoded OTP payload:", decoded);

      if (decoded.email !== email || decoded.code !== code) {
        return res.status(400).json({ message: "Invalid email or OTP." });
      }

      let user = await User.findOne({ email }).select("+password");

      if (user) {
        if (!user.password) {
          user.password = password; 
          await user.save();
          logger.info(`Password set for existing user: ${email}`);
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        user.refreshToken = refreshToken;
        await user.save();

        return res.status(200).json({
          status: "success",
          message: "User verified.",
          redirectUrl: getRedirectUrl(user, true),
        });
      } else {
        const now = new Date();
        const trialEndAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

const newUserData = {
  _id: decoded.temporaryUserId,
  firstname: decoded.firstname || "User",
  lastname: decoded.lastname || "Unknown",
  email: decoded.email,
  phone: decoded.phone || "",
  password,
  verified: true,
  role: decoded.occupation || "student",
  occupation: decoded.occupation || "student",
  educationLevel: decoded.educationLevel || "high",
  grade: decoded.grade,
  schoolName: decoded.schoolName || "Unknown School",
  schoolCountry: decoded.schoolCountry || "GH",
  teacherGrade: decoded.teacherGrade || [],
  teacherSubject: decoded.teacherSubject || "",
  program: decoded.program || "", 
  is_on_trial: true,
  trial_start_at: now,
  trial_end_at: trialEndAt,
  subscription_status: "inactive",
};


        const newUser = new User(newUserData);
        await newUser.save();

        const accessToken = generateAccessToken(newUser);
        const refreshToken = generateRefreshToken(newUser);
        newUser.refreshToken = refreshToken;
        await newUser.save();

        setAuthCookies(res, accessToken, refreshToken);
        sendWelcomeEmail(newUser.email, newUser.firstname).catch(logger.error);

        return res.status(201).json({
          status: "success",
          message: "User created & verified.",
          redirectUrl: getRedirectUrl(newUser, true),
        });
      }
    } catch (err) {
      logger.error("❌ Verify-OTP error:", err);
      if (err.name === "TokenExpiredError") {
        return res.status(400).json({ message: "OTP expired." });
      }
      return res.status(500).json({ message: "OTP verification failed." });
    }
  });

  publicRouter.post(
    "/users/login",
    loginLimiter,
    validate(loginSchema),
    async (req, res) => {
      try {
        const email = req.body.email?.trim().toLowerCase();
        const password = req.body.password?.trim();

        const user = await User.findOne({ email }).select("+password");
        if (!user)
          return res.status(401).json({ status: false, message: "Invalid credentials." });

        const match = await user.comparePassword(password);
        if (!match)
          return res.status(401).json({ status: false, message: "Invalid credentials." });

        const now = new Date();
        let subscriptionActive = false;
        let trialActive = false;

        if (user.subscription_status === "active" && user.payment_date) {
          const expiry = user.nextBillingDate
            ? new Date(user.nextBillingDate)
            : new Date(user.payment_date);
          if (!user.nextBillingDate) expiry.setMonth(expiry.getMonth() + 1);
          subscriptionActive = now < expiry;
          if (!subscriptionActive) {
            user.subscription_status = "expired";
            await user.save();
          }
        }

        if (user.is_on_trial && user.trial_end_at) {
          trialActive = now < new Date(user.trial_end_at);
          if (!trialActive) {
            user.is_on_trial = false;
            await user.save();
          }
        }

        const hasAccess = subscriptionActive || trialActive;

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        await User.findByIdAndUpdate(user._id, { refreshToken });
        setAuthCookies(res, accessToken, refreshToken);

        const redirectUrl = getRedirectUrl(user, hasAccess);

        res.json({
          status: true,
          message: "Login successful",
          user: {
            email: user.email,
            role: user.role,
            id: user._id,
            subscriptionActive,
            trialActive,
          },
          redirectUrl,
        });
      } catch (err) {
        logger.error("❌ Login error:", err);
        return res.status(500).json({ status: false, message: "Server error" });
      }
    }
  );

  function getRedirectUrl(user, hasAccess) {
    const { role } = user;
    const bypassRoles = ["global_overseer", "overseer"];
    if (bypassRoles.includes(role)) return redirectPaths[role] || redirectPaths.default;
    if (redirectPaths[role]) return hasAccess ? redirectPaths[role] : redirectPaths.payment;
    return redirectPaths.default;
  }

  publicRouter.post("/users/logout", async (req, res) => {
    try {
      const refreshToken = req.cookies.refresh_token;
      if (refreshToken)
        await User.updateOne({ refreshToken }, { $unset: { refreshToken: "" } });

      const cookieOptions = {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "None",
        domain: IS_PROD ? ".smartstudentact.com" : undefined,
      };

      res.clearCookie("access_token", cookieOptions);
      res.clearCookie("refresh_token", cookieOptions);
      res.json({ message: "Logged out successfully." });
    } catch (err) {
      logger.error("❌ Logout error:", err);
      res.status(500).json({ error: "Server error." });
    }
  });

  publicRouter.post(
    "/auth/forgot-password",
    generalLimiter,
    validate(forgotPasswordSchema),
    async (req, res) => {
      const email = req.body.email?.trim().toLowerCase();
      try {
        const user = await User.findOne({ email });
        if (!user)
          return res.status(200).json({
            message: "If an account exists, a reset link has been sent.",
          });

        const token = crypto.randomBytes(32).toString("hex");
        user.reset_password_token = token;
        user.reset_password_expires = Date.now() + PASSWORD_RESET_EXPIRY;
        await user.save();

        const resetLink = `${req.protocol}://${req.get(
          "host"
        )}/reset-password.html?token=${token}`;
        await sendResetEmail(user.email, resetLink);

        eventBus.emit("password_reset_requested", { userId: user._id, email: user.email });
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
    generalLimiter,
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

        user.password = newPassword; 
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

  publicRouter.post(
    "/contact",
    generalLimiter,
    validate(contactSchema),
    async (req, res) => {
      const { name, email, message } = req.body;
      try {
        await sendContactEmail(
          CONTACT_EMAIL,
          `New Contact Form Message from ${name}`,
          `<p><strong>Name:</strong> ${name}</p>
           <p><strong>Email:</strong> ${email}</p>
           <p><strong>Message:</strong><br>${message}</p>`
        );
        res.status(200).json({ message: "Your message has been sent successfully." });
      } catch (err) {
        logger.error("❌ Contact form error:", err);
        res.status(500).json({ error: "Failed to send message." });
      }
    }
  );

  return publicRouter;
};
