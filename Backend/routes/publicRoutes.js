// routes/publicRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import Joi from "joi";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import School from "../models/School.js";
import logger from "../utils/logger.js";
import {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} from "../middlewares/auth.js";
import {
  sendOTPEmail,
  sendWelcomeEmail,
  sendResetEmail,
} from "../utils/email.js";


const CONTACT_EMAIL = process.env.CONTACT_EMAIL;
const IS_PROD = process.env.NODE_ENV === "production";
const PASSWORD_RESET_EXPIRY = 3600000;

// ✅ Use safe lazy access for env values
const getJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.warn("⚠️ JWT_SECRET missing from environment; OTP tokens may fail.");
  }
  return secret || "temporary_fallback_secret";
};

// ---------- Redirect Logic ----------
const redirectPaths = {
  web: {
    global_overseer: "/global_overseer.html",
    overseer: "/overseer.html",
    admin: "/admins.html",
    teacher: "/teachers.html",
    student: "/students.html",
    worker: "/worker.html",
    payment: "/payment.html",
    resetPassword: "/reset-password.html",
    login: "/login.html",
    contact: "/contact.html",
  },
  app: {
    global_overseer: "/global_overseer",
    overseer: "/overseer",
    admin: "/admin",
    teacher: "/(app)/(teachers-tabs)/teachers",
    student: "/(app)/(students-tabs)/students",
    payment: "/payment",
    resetPassword: "/reset-password",
    login: "/login",
    contact: "/contact",
  },
};

function isAppRequest(req) {
  return (
    req.headers["x-client-type"] === "app" ||
    req.headers["user-agent"]?.toLowerCase().includes("okhttp") ||
    req.headers["user-agent"]?.toLowerCase().includes("expo")
  );
}

function getRedirectUrl(user, hasAccess, req) {
  const { role } = user || {};
  const target = isAppRequest(req) ? redirectPaths.app : redirectPaths.web;

  const bypassRoles = ["global_overseer", "overseer"];
  if (bypassRoles.includes(role)) return target[role] || target.login;

  if (role && target[role]) {
    return hasAccess ? target[role] : target.payment;
  }
  return target.login;
}

function getGenericRedirect(req, path = "login") {
  const target = isAppRequest(req) ? redirectPaths.app : redirectPaths.web;
  return target[path] || target.login;
}

export default function publicRoutes(eventBus) {
  const publicRouter = express.Router();

  // ---------- Rate Limiters ----------
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: "Too many login attempts. Try again later.",
  });

  const generalLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 1000,
    message: "Too many requests. Try again later.",
  });

  // ---------- Joi Schemas ----------
  const signupOtpSchema = Joi.object({
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    email: Joi.string().email().required(),
    firstname: Joi.string().min(2).max(50).required(),
    lastname: Joi.string().min(2).max(50).required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/)
      .required(),
    confirmPassword: Joi.string().valid(Joi.ref("password")).required(),
    occupation: Joi.string().valid("student", "teacher", "worker").required(),
    schoolName: Joi.string().required(),
    schoolCountry: Joi.string().required(),
    educationLevel: Joi.string().when("occupation", {
      is: "student",
      then: Joi.required(),
      otherwise: Joi.allow(""),
    }),
    grade: Joi.string().when("occupation", {
      is: "student",
      then: Joi.string().pattern(/^(10|11|12|100|200|300|400)$/).required(),
      otherwise: Joi.allow(""),
    }),
    program: Joi.string().when("occupation", {
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
    country: Joi.string().when("occupation", {
      is: "worker",
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

  // ---------- Validation Middleware ----------
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

  // ---------- Signup OTP ----------
  publicRouter.post(
    "/users/signup-otp",
    rateLimit({ windowMs: 5 * 60 * 1000, max: 5 }),
    validate(signupOtpSchema),
    async (req, res) => {
      try {
        const payload = {
          ...req.body,
          temporaryUserId: crypto.randomUUID(),
          code: Math.floor(100000 + Math.random() * 900000).toString(),
        };

        const existingUser = await User.findOne({ email: payload.email });
        const otpToken = jwt.sign(payload, getJWTSecret(), { expiresIn: "10m" });
        await sendOTPEmail(payload.email, payload.firstname, payload.code);

        return res.status(200).json({
          status: "success",
          message: existingUser
            ? "OTP sent to existing user."
            : "OTP sent. Please verify to complete signup.",
          otpToken,
          redirectUrl: getGenericRedirect(req, "login"),
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

      if (decoded.email !== email || decoded.code !== code) {
        return res.status(400).json({ message: "Invalid email or OTP." });
      }

      let user = await User.findOne({ email }).select("+password");
      if (user) {
        if (!user.password) {
          user.password = password;
          await user.save();
        }
      } else {
        // create user + school
        let school = await School.findOne({
          schoolName: decoded.schoolName?.trim(),
          schoolCountry: decoded.schoolCountry?.toUpperCase(),
        });
        if (!school) {
          school = new School({
            schoolName: decoded.schoolName?.trim() || "Unknown School",
            schoolCountry: decoded.schoolCountry?.toUpperCase() || "UNKNOWN",
            tier: 1,
          });
          await school.save();
        }
        const now = new Date();
        const trialEndAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        user = new User({
          firstname: decoded.firstname || "User",
          lastname: decoded.lastname || "Unknown",
          email: decoded.email,
          phone: decoded.phone || "",
          password,
          verified: true,
          role: decoded.occupation || "student",
          occupation: decoded.occupation || "student",
          school: school._id,
          is_on_trial: true,
          trial_start_at: now,
          trial_end_at: trialEndAt,
          subscription_status: "inactive",
          program: decoded.program || "",
          teacherGrade: decoded.teacherGrade || undefined,
          teacherSubject: decoded.teacherSubject || undefined,
          educationLevel: decoded.educationLevel || undefined,
          grade: decoded.grade ? Number(decoded.grade) : undefined,
        });
        await user.save();
        sendWelcomeEmail(user.email, user.firstname).catch(logger.error);
      }

      // tokens
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      user.refreshToken = refreshToken;
      await user.save();
      setAuthCookies(res, accessToken, refreshToken);

      return res.status(200).json({
        status: "success",
        message: "User verified.",
        redirectUrl: getRedirectUrl(user, true, req),
      });
    } catch (err) {
      logger.error("❌ Verify-OTP error:", err);
      if (err.name === "TokenExpiredError") {
        return res.status(400).json({ message: "OTP expired." });
      }
      return res.status(500).json({ message: "OTP verification failed." });
    }
  });


  publicRouter.post("/users/login", loginLimiter, validate(loginSchema), async (req, res) => {
    // Detailed tracing to pinpoint where validation errors occur
    console.log('>>> ENTER LOGIN HANDLER');
    const email = req.body.email?.trim().toLowerCase();
    console.log('Login attempt for email:', email);
    logger.info(`Login attempt for email: ${email}`);

    try {
      const password = req.body.password?.trim();

      logger.info('Login: fetching user by email');
      const user = await User.findOne({ email }).select("+password");
      if (!user) {
        logger.info('Login: user not found: ' + email);
        return res.status(401).json({ status: false, message: "Invalid credentials." });
      }

      logger.info('Login: verifying password for user ' + user._id);
      let match;
      try {
        match = await user.comparePassword(password);
      } catch (pwErr) {
        logger.error('Login: password comparison failed', pwErr);
        throw pwErr;
      }

      if (!match) {
        logger.info('Login: password mismatch for user ' + user._id);
        return res.status(401).json({ status: false, message: "Invalid credentials." });
      }

      const now = new Date();
      let subscriptionActive = false;
      let trialActive = false;

      logger.info('Login: checking subscription and trial status for user ' + user._id);
      if (user.subscription_status === "active" && user.payment_date) {
        const expiry = user.nextBillingDate
          ? new Date(user.nextBillingDate)
          : new Date(user.payment_date);
        if (!user.nextBillingDate) expiry.setMonth(expiry.getMonth() + 1);
        subscriptionActive = now < expiry;
        logger.info('Login: subscriptionActive=' + subscriptionActive + ' for user ' + user._id);
        if (!subscriptionActive) {
          logger.info('Login: marking subscription expired for user ' + user._id);
          // Avoid triggering validators that require payment fields when marking expired
          await User.updateOne({ _id: user._id }, { $set: { subscription_status: 'expired' } }, { runValidators: false });
          user.subscription_status = 'expired';
        }
      }

      if (user.is_on_trial && user.trial_end_at) {
        trialActive = now < new Date(user.trial_end_at);
        logger.info('Login: trialActive=' + trialActive + ' for user ' + user._id);
        if (!trialActive) {
          logger.info('Login: ending trial for user ' + user._id);
          // Mark trial as ended without running schema validators that require payment fields
          await User.updateOne({ _id: user._id }, { $set: { is_on_trial: false, subscription_status: 'inactive' } }, { runValidators: false });
          // Keep local user object in sync for subsequent logic
          user.is_on_trial = false;
          user.subscription_status = 'inactive';
        }
      }

      console.log('Login: subscriptionActive=', subscriptionActive, 'trialActive=', trialActive, 'for user', user._id);
      const hasAccess = subscriptionActive || trialActive;
      logger.info('Login: hasAccess=' + hasAccess + ' for user ' + user._id);

      if (!hasAccess) {
        // Ensure user record reflects expired trial/subscription without running validators
        await User.updateOne({ _id: user._id }, { $set: { is_on_trial: false, subscription_status: 'expired' } }, { runValidators: false });
        return res.status(403).json({ status: false, message: 'Your trial or subscription has expired. Please subscribe to continue.', redirectUrl: getGenericRedirect(req, 'payment') });
      }

      const accessToken = generateAccessToken(user);
      logger.info('Login: generated access token for user ' + user._id);
      const refreshToken = generateRefreshToken(user);
      logger.info('Login: generated refresh token for user ' + user._id);
      // Use updateOne with runValidators:false to avoid triggering required-field validators
      await User.updateOne({ _id: user._id }, { $set: { refreshToken } }, { runValidators: false });
      setAuthCookies(res, accessToken, refreshToken);

      res.json({
        status: true,
        message: "Login successful",
        user: {
          email: user.email,
          role: user.role,
          id: user._id,
          firstname: user.firstname,
          lastname: user.lastname,
          profile_picture_url: getProfileUrl(req, user.profile_picture_url || user.profile_photo_url),
          imageUrl: getProfileUrl(req, user.profile_picture_url || user.profile_photo_url),
          subscriptionActive,
          trialActive,
        },
        redirectUrl: getRedirectUrl(user, hasAccess, req),
      });
    } catch (err) {
      logger.error("❌ Login error:", err);
      return res.status(500).json({ status: false, message: "Server error" });
    }
  });

 
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

      res.json({
        message: "Logged out successfully.",
        redirectUrl: getGenericRedirect(req, "login"),
      });
    } catch (err) {
      logger.error("❌ Logout error:", err);
      res.status(500).json({ error: "Server error." });
    }
  });

  // Find user by email (used by special-links UI)
  publicRouter.get("/users/find", async (req, res) => {
    try {
      const email = (req.query.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Email query parameter required." });

      const user = await User.findOne({ email }).select("firstname lastname email role");
      if (!user) return res.status(404).json({ message: "User not found." });

      return res.status(200).json({ userId: user._id, firstname: user.firstname, lastname: user.lastname, email: user.email, role: user.role });
    } catch (err) {
      logger.error("Error finding user:", err);
      return res.status(500).json({ message: "Failed to find user." });
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
        if (user) {
          const token = crypto.randomBytes(32).toString("hex");
          user.reset_password_token = token;
          user.reset_password_expires = Date.now() + PASSWORD_RESET_EXPIRY;
          await user.save();
          const resetLink = `${req.protocol}://${req.get("host")}${getGenericRedirect(
            req,
            "resetPassword"
          )}?token=${token}`;
          await sendResetEmail(user.email, resetLink);
          eventBus.emit("password_reset_requested", {
            userId: user._id,
            email: user.email,
          });
        }
        res.status(200).json({
          message: "If an account exists, a reset link has been sent.",
          redirectUrl: getGenericRedirect(req, "resetPassword"),
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
        if (!user) {
          return res
            .status(400)
            .json({ message: "Password reset token invalid or expired." });
        }
        user.password = newPassword;
        user.reset_password_token = undefined;
        user.reset_password_expires = undefined;
        await user.save();

        res.status(200).json({
          message: "Password successfully reset.",
          redirectUrl: getGenericRedirect(req, "login"),
        });
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
        res.status(200).json({
          message: "Your message has been sent successfully.",
          redirectUrl: getGenericRedirect(req, "contact"),
        });
      } catch (err) {
        logger.error("❌ Contact form error:", err);
        res.status(500).json({ error: "Failed to send message." });
      }
    }
  );

  return publicRouter;
};

