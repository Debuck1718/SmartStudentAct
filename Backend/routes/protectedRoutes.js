import express from "express";
import multer from "multer";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import Joi from "joi";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import logger from "../utils/logger.js";
import webpush from "web-push";
import jwt from "jsonwebtoken";
import eventBus, { emailTemplates, agenda } from '../utils/eventBus.js';
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { authenticateJWT } from "../middlewares/auth.js";
import checkSubscription from "../middlewares/checkSubscription.js";
import { v2 as cloudinary } from "cloudinary";

import User from "../models/User.js";
import Goal from "../models/Goal.js";
import Budget from "../models/Budget.js";
import Assignment from "../models/Assignment.js";
import Submission from "../models/Submission.js";
import PushSub from "../models/PushSub.js";
import School from "../models/School.js";
import Quiz from "../models/Quiz.js";
import StudentTask from "../models/StudentTask.js";
import SchoolCalendar from "../models/SchoolCalendar.js";
import { Message } from "../models/index.js";
import SpecialLink from "../models/SpecialLink.js";
import Reward from "../models/Reward.js";

import advancedGoalsRouter from "./advancedGoals.js";
import essayRouter from "./essay.js";
import budgetRouter from "./budget.js";
import schoolRouter from "./schoolRoutes.js";
import uploadRouter from "./uploadRoutes.js";
import workerRouter from "../worker/index.js";
import specialLinksHandler from "../special-links/index.js";

import { toIsoCountryCode, fromIsoCountryCode } from "../utils/countryHelper.js";
import * as paymentController from "../controllers/paymentController.js";
import { getUserPrice } from "../services/pricingService.js";

const smsApi = {};

async function sendSMS(phone, message) {
  if (!phone) return;
  const recipient = phone.startsWith("+") ? phone : `+${phone}`;
  try {
    await smsApi.sendTransacSms({
      sender: process.env.BREVO_SMS_SENDER || "SmartStudentAct",
      recipient,
      content: message,
    });
    logger.info(`[Brevo SMS] Sent to ${recipient}: ${message}`);
  } catch (err) {
    logger.error(`[Brevo SMS] Failed to send to ${recipient}: ${err.message}`);
  }
}

async function sendPushToUser(userId, payload) {
  const sub = await PushSub.findOne({ user_id: userId });
  if (sub && sub.subscription) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
    } catch (err) {
      logger.error(
        "Failed to send push notification to %s: %s",
        userId,
        err.message
      );
    }
  }
}

async function notifyUser(userId, title, message, url) {
  const user = await User.findById(userId).select("phone");
  await sendPushToUser(userId, { title, body: message, url });
  await sendSMS(user?.phone, `${title}: ${message}`);
}

const protectedRouter = express.Router();

const hasRole = (allowedRoles) => (req, res, next) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      status: false,
      message: "Sorry, you are not authorized to view this resource.",
    });
  }
  next();
};

// ✅ Middleware to protect all routes
protectedRouter.use(authenticateJWT);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Centralize absolute directories for uploads
const dirs = {
  root: path.resolve(__dirname, ".."),
  uploads: path.resolve(__dirname, "..", "uploads"),
  assignments: path.resolve(__dirname, "..", "uploads", "assignments"),
  submissions: path.resolve(__dirname, "..", "uploads", "submissions"),
  feedback: path.resolve(__dirname, "..", "uploads", "feedback"),
  other: path.resolve(__dirname, "..", "uploads", "other"),
};

// Ensure upload directories exist
(async () => {
  for (const d of Object.values(dirs)) {
    try {
      await fs.mkdir(d, { recursive: true });
      logger.info(`Ensured upload directory exists: ${d}`);
    } catch (error) {
      logger.error(`Failed to create upload directory ${d}: ${error.message}`);
    }
  }
})();

const localDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    let dest;
    if (req.path.includes("/teacher/assignments")) {
      dest = dirs.assignments;
    } else if (req.path.includes("/student/submissions")) {
      dest = dirs.submissions;
    } else if (req.path.includes("/teacher/feedback")) {
      dest = dirs.feedback;
    } else {
      dest = dirs.other;
    }
    cb(null, dest);
  },
  filename: (_req, file, cb) =>
    cb(
      null,
      Date.now() +
        "-" +
        crypto.randomBytes(4).toString("hex") +
        path.extname(file.originalname).toLowerCase()
    ),
});

// Helper - determine if a student is included in an assignment
function isStudentAssignedToAssignment(assignment, user) {
  if (!assignment || !user) return false;
  const userId = String(user._id || user.id || user);
  const userEmail = user.email;
  const userGrade = user.grade;
  const userProgram = user.program;
  const userSchool = user.school || user.schoolName || (user.school && user.school._id);

  // assigned_to_users may contain ObjectId refs or email strings
  const assignedUsers = (assignment.assigned_to_users || []).map((u) => String(u));
  if (assignedUsers.includes(userId) || assignedUsers.includes(userEmail)) return true;

  if (Array.isArray(assignment.assigned_to_grades) && assignment.assigned_to_grades.includes(Number(userGrade))) return true;
  if (Array.isArray(assignment.assigned_to_programs) && assignment.assigned_to_programs.includes(userProgram)) return true;
  if (Array.isArray(assignment.assigned_to_other_grades) && assignment.assigned_to_other_grades.includes(Number(userGrade))) return true;
  // assigned_to_schools may contain objectids or strings
  const assignedSchools = (assignment.assigned_to_schools || []).map((s) => String(s));
  if (userSchool && assignedSchools.includes(String(userSchool))) return true;
  return false;
}

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "smartstudent-uploads",
    allowed_formats: ["jpg", "png", "jpeg", "webp", "gif"],
    transformation: [{ width: 800, crop: "scale" }],
  },
});

const profilePictureStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "smartstudent-profile-pictures",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});


const createUploadMiddleware = (storageEngine) =>
  multer({
    storage: storageEngine,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowedExtensions = [
        ".pdf",
        ".doc",
        ".docx",
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
      ];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
        return cb(new Error("Invalid file type."), false);
      }
      cb(null, true);
    },
  });

const localUpload = createUploadMiddleware(localDiskStorage);
const cloudinaryUpload = createUploadMiddleware(cloudinaryStorage);
const profileUpload = multer({ storage: profilePictureStorage });

// Helper to compute profile picture URL with a default fallback
function getProfileUrl(req, storedUrl) {
  if (!storedUrl) return null;
  if (storedUrl.startsWith("http://") || storedUrl.startsWith("https://")) return storedUrl;
  // storedUrl may be a local path e.g. /uploads/... — return absolute URL for client
  try {
    const host = req.get("host");
    const protocol = req.protocol;
    return `${protocol}://${host}${storedUrl}`;
  } catch (e) {
    return storedUrl || DEFAULT_URL;
  }
}

const timezoneSchema = Joi.object({
  timezone: Joi.string().required(),
});

const promoteUserSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string()
    .valid("student", "teacher", "admin", "overseer", "global-overseer")
    .required(),
});
const removeUserSchema = Joi.object({
  email: Joi.string().email().required(),
});

const teacherAssignmentSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().allow("", null),
  due_date: Joi.date().iso().required(),

  assigned_to_users: Joi.array().items(Joi.string().email()).default([]),

  assigned_to_grades: Joi.array()
    .items(Joi.number().integer().min(1).max(12))
    .default([]),

  assigned_to_levels: Joi.array()
    .items(Joi.number().valid(100, 200, 300, 400))
    .default([]),

  assigned_to_programs: Joi.array()
    .items(Joi.string())
    .default([]),

  assigned_to_schools: Joi.array().items(Joi.string()).default([]),

  assignToMyGrade: Joi.boolean().default(false),
  assignToMyLevel: Joi.boolean().default(false),
  assignToSchool: Joi.boolean().default(false),
  assignToMyProgram: Joi.boolean().default(false),
}).unknown(true);


const feedbackSchema = Joi.object({
  feedback_grade: Joi.number().min(0).max(100).optional(),
  feedback_comments: Joi.string().allow("", null),
});

const paymentSchema = Joi.object({
  gateway: Joi.string()
    .valid("flutterwave", "paystack")
    .required(),

  email: Joi.string()
    .email()
    .required(),

  amount: Joi.number()
    .positive()
    ,

  currency: Joi.string()
    .uppercase()
    .length(3) 
    ,

  phoneNumber: Joi.string()
    .allow(null, '') 
    .optional(),
});

const paymentSuccessSchema = Joi.object({
  gateway: Joi.string().valid("flutterwave", "paystack").required(),
  transaction_reference: Joi.string().required(),
});

const schoolSchema = Joi.object({
  schoolName: Joi.string().min(2).required(),
  schoolCountry: Joi.string().length(2).uppercase().required(),
  tier: Joi.number().integer().min(1).required(),
});

const assignRegionSchema = Joi.object({
  overseerEmail: Joi.string().email().required(),
  region: Joi.string().required(),
});


const settingsSchema = Joi.object({
  firstname: Joi.string().min(2).max(50).optional(),
  lastname: Joi.string().min(2).max(50).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .optional(),

  occupation: Joi.string().valid("student", "teacher").required(),

  school: Joi.object({
    schoolName: Joi.string().max(100).required(),
    schoolCountry: Joi.string().max(100).required(),
  }).required(),

  // === Student-only fields ===
  educationLevel: Joi.when("occupation", {
    is: "student",
    then: Joi.string()
      .valid("junior", "high", "university")
      .required(),
    otherwise: Joi.forbidden(),
  }),

  grade: Joi.when("occupation", {
    is: "student",
    then: Joi.when("educationLevel", {
      is: Joi.valid("junior", "high"),
      then: Joi.number().integer().min(1).max(12).required(),
      otherwise: Joi.forbidden(),
    }),
    otherwise: Joi.forbidden(),
  }),

  university: Joi.when("occupation", {
    is: "student",
    then: Joi.when("educationLevel", {
      is: "university",
      then: Joi.string().max(150).required(),
      otherwise: Joi.forbidden(),
    }),
    otherwise: Joi.forbidden(),
  }),

  uniLevel: Joi.when("occupation", {
    is: "student",
    then: Joi.when("educationLevel", {
      is: "university",
      then: Joi.string().valid("100", "200", "300", "400").required(),
      otherwise: Joi.forbidden(),
    }),
    otherwise: Joi.forbidden(),
  }),

  program: Joi.when("occupation", {
    is: "student",
    then: Joi.string().max(100).optional(),
    otherwise: Joi.forbidden(),
  }),

  // === Teacher-only fields ===
  teacherGrade: Joi.when("occupation", {
    is: "teacher",
    then: Joi.array().items(Joi.string()).required(),
    otherwise: Joi.forbidden(),
  }),

  teacherSubject: Joi.when("occupation", {
    is: "teacher",
    then: Joi.string().max(100).required(),
    otherwise: Joi.forbidden(),
  }),
}).min(1);

const passwordUpdateSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
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


protectedRouter.post(
  "/timezone",
  authenticateJWT,
  validate(timezoneSchema),
  async (req, res) => {
    const { timezone } = req.body;
    const userId = req.userId;
    const result = await User.updateOne({ _id: userId }, { timezone });
    if (result.modifiedCount > 0) {
      res.json({ ok: true, message: "Timezone updated." });
    } else {
      res.status(404).json({ error: "User not found or no change." });
    }
  }
);

// Grant rewards (teacher or admin can grant): accepts array of grants
protectedRouter.post(
  "/teacher/calendar/grant",
  authenticateJWT,
  hasRole(["teacher", "admin", "global_overseer"]),
  async (req, res) => {
    try {
      const { grants } = req.body; // [{ userId, type, points, description }]
      if (!Array.isArray(grants) || !grants.length) return res.status(400).json({ message: "No grants provided." });

      const results = [];
      for (const g of grants) {
        const { userId, type, points = 0, description = "" } = g;
        if (!userId || !type) continue;
        const reward = new Reward({ user_id: userId, type, points, description, granted_by: req.user.id });
        await reward.save();
        eventBus.emit("reward_granted", { userId, type, points, reason: description });
        results.push(reward);
      }

      res.status(201).json({ message: "Rewards granted.", rewards: results });
    } catch (err) {
      logger.error("Error granting rewards:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// GET teacher calendar (by academicYear or latest)
protectedRouter.get(
  "/teacher/calendar",
  authenticateJWT,
  hasRole(["teacher", "admin", "global_overseer"]),
  async (req, res) => {
    try {
      const requester = await User.findById(req.userId).populate("school");
      if (!requester) return res.status(404).json({ message: "User not found." });

      const { academicYear, schoolId } = req.query;

      let targetSchoolId = null;
      if (requester.role === "teacher") {
        if (!requester.school) return res.status(404).json({ message: "Teacher or school not found." });
        targetSchoolId = requester.school._id;
      } else if (["admin", "global_overseer"].includes(requester.role)) {
        targetSchoolId = schoolId || (requester.school ? requester.school._id : null);
        if (!targetSchoolId) return res.status(400).json({ message: "Please specify schoolId when calling this endpoint as admin." });
      }

      let calendar;
      if (academicYear) {
        calendar = await SchoolCalendar.findOne({ school: targetSchoolId, academicYear });
      } else {
        calendar = await SchoolCalendar.findOne({ school: targetSchoolId }).sort({ updatedAt: -1 });
      }

      if (!calendar) return res.status(200).json({ academicYear: null, terms: [] });

      res.status(200).json({ academicYear: calendar.academicYear, terms: calendar.terms });
    } catch (err) {
      logger.error("Error fetching calendar:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Compute term results for a school/term - accessible to teacher and admins
protectedRouter.get(
  "/teacher/calendar/results",
  authenticateJWT,
  hasRole(["teacher", "admin", "global_overseer"]),
  async (req, res) => {
    try {
      const requester = await User.findById(req.userId).populate("school");
      if (!requester) return res.status(404).json({ message: "User not found." });

      const { academicYear, termName, schoolId } = req.query;
      if (!academicYear || !termName) return res.status(400).json({ message: "academicYear and termName are required" });
      // determine target school
      let targetSchoolId = null;
      if (requester.role === "teacher") {
        if (!requester.school) return res.status(404).json({ message: "Teacher or school not found." });
        targetSchoolId = requester.school._id;
      } else if (["admin", "global_overseer"].includes(requester.role)) {
        if (schoolId) targetSchoolId = schoolId;
        else if (requester.school) targetSchoolId = requester.school._id;
        else return res.status(400).json({ message: "Please specify schoolId when calling this endpoint as admin." });
      }

      const calendar = await SchoolCalendar.findOne({ school: targetSchoolId, academicYear });
      if (!calendar) return res.status(404).json({ message: "School calendar not found for the given academic year." });

      const term = calendar.terms.find(t => t.termName === termName || t.termName === termName.trim());
      if (!term) return res.status(404).json({ message: "Term not found in academic year." });

      const start = new Date(term.startDate);
      const end = new Date(term.endDate);

      // fetch students in the school
      const students = await User.find({ school: teacher.school._id, role: "student" }).select("_id firstname lastname email grade");

      // Pre-fetch data
      const assignments = await Assignment.find({ teacher_id: teacher._id });
      const assignmentIds = assignments.map(a => a._id);
      const submissions = await Submission.find({ assignment_id: { $in: assignmentIds }, submitted_at: { $gte: start, $lte: end } });
      const quizzes = await Quiz.find({});
      const rewards = await Reward.find({ granted_at: { $gte: start, $lte: end } });

      const studentResults = [];

      for (const s of students) {
        // Assignment average
        const subs = submissions.filter(sub => String(sub.user_id) === String(s._id) && typeof sub.feedback_grade === 'number');
        let assignmentAvg = 0;
        if (subs.length) assignmentAvg = subs.reduce((sum, x) => sum + (x.feedback_grade || 0), 0) / subs.length;

        // Quiz avg (use quiz.submissions score)
        let quizScores = [];
        for (const q of quizzes) {
          const qs = (q.submissions || []).filter(sub => String(sub.student_id) === String(s._id) && sub.submitted_at && new Date(sub.submitted_at) >= start && new Date(sub.submitted_at) <= end);
          for (const sub of qs) {
            if (typeof sub.score === 'number' && q.questions && q.questions.length) {
              const percent = (sub.score / q.questions.length) * 100;
              quizScores.push(percent);
            }
          }
        }
        const quizAvg = quizScores.length ? quizScores.reduce((a,b) => a+b,0) / quizScores.length : 0;

        // Reward points in term
        const rewardPoints = rewards.filter(r => String(r.user_id) === String(s._id)).reduce((sum,x)=> sum + (x.points || 0), 0);

        // Activity: count submissions + quiz attempts
        const activityCount = subs.length + quizScores.length;
        const activityScore = Math.min(100, activityCount * 10 + rewardPoints);

        const totalScore = Math.round(0.5 * assignmentAvg + 0.4 * quizAvg + 0.1 * activityScore);

        studentResults.push({
          student: { _id: s._id, firstname: s.firstname, lastname: s.lastname, email: s.email },
          assignmentAvg: Math.round(assignmentAvg),
          quizAvg: Math.round(quizAvg),
          rewardPoints,
          activityCount,
          score: totalScore,
        });
      }

      studentResults.sort((a,b)=> b.score - a.score);
      studentResults.forEach((r, idx) => { r.position = idx+1; });

      res.status(200).json({ term: { termName: term.termName, start: term.startDate, end: term.endDate }, results: studentResults });
    } catch (err) {
      logger.error("Error computing term results:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.patch(
  "/settings",
  authenticateJWT,
  validate(settingsSchema),
  async (req, res) => {
    const userId = req.userId;
    const updateData = req.body;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      if (updateData.email && updateData.email !== user.email) {
        const existingUser = await User.findOne({ email: updateData.email });
        if (existingUser) {
          return res.status(409).json({ message: "Email already in use." });
        }
      }

      const result = await User.updateOne({ _id: userId }, updateData);
      if (result.modifiedCount > 0) {
        res
          .status(200)
          .json({
            message: "Settings updated successfully.",
            updatedFields: updateData,
          });
      } else {
        res.status(200).json({ message: "No changes were made." });
      }
    } catch (error) {
      logger.error("Error updating user settings:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.patch(
  "/settings/password",
  authenticateJWT,
  validate(passwordUpdateSchema),
  async (req, res) => {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    try {
      
      const user = await User.findById(userId).select("+password");

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

     
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid current password." });
      }

      
      user.password = newPassword;

      await user.save();

      res.status(200).json({ message: "Password updated successfully." });
    } catch (error) {
      logger.error("Error updating password:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);



protectedRouter.get("/profile", authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate("school", "schoolName schoolCountry") 
      .select(
        "firstname lastname email phone occupation school educationLevel grade university uniLevel program teacherGrade teacherSubject profile_picture_url"
      );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      user: {
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        phone: user.phone,
        occupation: user.occupation,
        school: user.school
          ? {
              schoolName: user.school.schoolName,
              schoolCountry: fromIsoCountryCode(user.school.schoolCountry),
            }
          : null,
        educationLevel: user.educationLevel,
        grade: user.grade,
        university: user.university,
        uniLevel: user.uniLevel,
        program: user.program,
        teacherGrade: user.teacherGrade,
        teacherSubject: user.teacherSubject,
        profile_picture_url: getProfileUrl(req, user.profile_picture_url),
        imageUrl: getProfileUrl(req, user.profile_picture_url || user.profile_photo_url),
        photoUrl: getProfileUrl(req, user.profile_picture_url || user.profile_photo_url),
      },
    });
  } catch (error) {
    logger.error("Error fetching profile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

protectedRouter.patch("/profile", authenticateJWT, validate(settingsSchema), async (req, res) => {
  const userId = req.userId || req.body.userId;
  let updateData = req.body;

  if (!userId) {
    return res.status(401).json({ message: "Authentication failed. User ID not found." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const currentOccupation = updateData.occupation || user.occupation;

    // Clear irrelevant fields
    if (currentOccupation === "student") {
      updateData.teacherGrade = undefined;
      updateData.teacherSubject = undefined;
    } else if (currentOccupation === "teacher" || currentOccupation === "admin") {
      updateData.educationLevel = undefined;
      updateData.grade = undefined;
      updateData.university = undefined;
      updateData.uniLevel = undefined;
      updateData.program = undefined;
    }

    // Handle School reference
    if (currentOccupation === "student" || currentOccupation === "teacher" || currentOccupation === "admin") {
      if (!updateData.school || !updateData.school.schoolName || !updateData.school.schoolCountry) {
        return res.status(400).json({ message: "School name and country are required for this occupation." });
      }
      const { schoolName, schoolCountry, tier = 1 } = updateData.school;
      const isoCountry = toIsoCountryCode(schoolCountry);

      let schoolDoc = await School.findOne({ schoolName, schoolCountry: isoCountry });
      if (!schoolDoc) {
        schoolDoc = await School.create({ schoolName, schoolCountry: isoCountry, tier });
      }
      updateData.school = schoolDoc._id;
    } else {
      // If occupation is not student, teacher, or admin, remove the school field
      updateData.school = undefined;
    }

    // ... rest of the logic is unchanged
    // ✅ Ensure email is unique
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await User.findOne({ email: updateData.email });
      if (existingUser) {
        return res.status(409).json({ message: "Email already in use." });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).populate("school");

    res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        firstname: updatedUser.firstname,
        lastname: updatedUser.lastname,
        email: updatedUser.email,
        phone: updatedUser.phone,
        occupation: updatedUser.occupation,
        school: updatedUser.school
          ? {
              schoolName: updatedUser.school.schoolName,
              schoolCountry: fromIsoCountryCode(updatedUser.school.schoolCountry),
              tier: updatedUser.school.tier,
            }
          : null,
        educationLevel: updatedUser.educationLevel,
        grade: updatedUser.grade,
        university: updatedUser.university,
        uniLevel: updatedUser.uniLevel,
        program: updatedUser.program,
        teacherGrade: updatedUser.teacherGrade,
        teacherSubject: updatedUser.teacherSubject,
  profile_picture_url: getProfileUrl(req, updatedUser.profile_picture_url || updatedUser.profile_photo_url),
  imageUrl: getProfileUrl(req, updatedUser.profile_picture_url || updatedUser.profile_photo_url),
  photoUrl: getProfileUrl(req, updatedUser.profile_picture_url || updatedUser.profile_photo_url),
      },
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: "Validation failed", errors: messages });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: "A user with this data already exists." });
    }
    logger.error("Error updating user profile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

protectedRouter.get("/schools/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const schools = await School.find({
      schoolName: { $regex: `^${q}`, $options: "i" },
    })
      .limit(10)
      .select("schoolName schoolCountry");

    const formattedSchools = schools.map((school) => ({
      name: school.schoolName,
      country: fromIsoCountryCode(school.schoolCountry),
    }));

    res.status(200).json(formattedSchools);
  } catch (error) {
    logger.error("Error searching schools:", error);
    res.status(500).json({ message: "Server error" });
  }
});

protectedRouter.delete("/profile", authenticateJWT, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isProd = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: "None",
      domain: isProd ? ".smartstudentact.com" : undefined,
    };
    res.clearCookie("token");
    res.clearCookie("access_token", cookieOptions);
    res.clearCookie("refresh_token", cookieOptions);

    res.status(200).json({ message: "Account deleted successfully." });
  } catch (error) {
    logger.error("Error deleting account:", error);
    res.status(500).json({ message: "Server error" });
  }
});

protectedRouter.post(
  "/profile/upload-photo",
  authenticateJWT,
  profileUpload.single("profilePhoto"),
  async (req, res) => {
    const userId = req.userId;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }


    try {
      // Determine stored path: support cloudinary (http) or local uploads (/uploads/...)
      let storedUrl = null;
      if (req.file && req.file.path) {
        const p = req.file.path;
        if (p.startsWith("http://") || p.startsWith("https://")) {
          storedUrl = p;
        } else if (p.includes("/uploads/")) {
          storedUrl = p.substring(p.indexOf("/uploads/"));
        } else {
          // best effort: if filename is present, store a local relative path
          storedUrl = req.file.filename ? `/uploads/other/${req.file.filename}` : p;
        }
      }

      const result = await User.updateOne(
        { _id: userId },
        { $set: { profile_picture_url: storedUrl } }
      );

      if (result.modifiedCount > 0) {
        const publicUrl = getProfileUrl(req, storedUrl);
        res.status(200).json({
          message: "Profile picture updated successfully.",
          profile_picture_url: storedUrl,
          photoUrl: publicUrl,
          imageUrl: publicUrl,
        });
      } else {
        res.status(200).json({ message: "No changes were made." });
      }
    } catch (error) {
      logger.error("Error uploading profile picture:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

protectedRouter.post(
  "/admin/promote",
  authenticateJWT,
  hasRole(["admin", "overseer", "global_overseer"]),
  validate(promoteUserSchema),
  async (req, res) => {
    const { email, role } = req.body;
    const actor = req.user;

    try {
      const targetUser = await User.findOne({ email });
      if (!targetUser) {
        return res.status(404).json({ error: "Target user not found." });
      }
      if (targetUser.email === actor.email) {
        return res
          .status(403)
          .json({ error: "Cannot modify your own account." });
      }

      if (
        req.userRole === "admin" &&
        ["overseer", "global_overseer"].includes(targetUser.role)
      ) {
        return res
          .status(403)
          .json({ error: "You do not have permission to modify this user." });
      }
      if (
        req.userRole === "overseer" &&
        targetUser.role === "global_overseer"
      ) {
        return res
          .status(403)
          .json({ error: "You do not have permission to modify this user." });
      }

      await User.updateOne({ email }, { role });
      logger.info(`User ${email} role changed to ${role} by ${actor.email}`);
      res.json({ message: "User updated successfully." });
    } catch (e) {
      res.status(500).json({ error: "Failed to update user status." });
    }
  }
);

protectedRouter.post(
  "/admin/remove-user",
  authenticateJWT,
  hasRole(["admin", "overseer", "global_overseer"]),
  validate(removeUserSchema),
  async (req, res) => {
    const { email } = req.body;
    const actor = req.user;
    if (actor.email === email) {
      return res.status(403).json({ error: "Cannot remove your own account." });
    }
    try {
      const targetUser = await User.findOne({ email });
      if (!targetUser) {
        return res.status(404).json({ error: "User not found." });
      }

      if (
        actor.role === "overseer" &&
        (targetUser.role === "overseer" ||
          targetUser.role === "global_overseer")
      ) {
        return res
          .status(403)
          .json({ error: "You do not have permission to remove this user." });
      }
      if (actor.role === "admin") {
        const actorSchool = actor.schoolName || actor.teacherSchool;
        const targetSchool = targetUser.schoolName || targetUser.teacherSchool;
        if (actorSchool !== targetSchool) {
          return res
            .status(403)
            .json({ error: "Can only remove users from your school." });
        }
        if (
          ["admin", "overseer", "global_overseer"].includes(targetUser.role)
        ) {
          return res
            .status(403)
            .json({ error: "You cannot remove this user." });
        }
      }

      const result = await User.deleteOne({ email });
      if (result.deletedCount === 0) {
        return res
          .status(404)
          .json({ error: "User not found or not authorized." });
      }
      logger.info(`User ${email} removed by ${actor.email}`);
      res.json({ message: "User removed successfully." });
    } catch (e) {
      res.status(500).json({ error: "Failed to remove user." });
    }
  }
);

protectedRouter.get(
  "/admin/schools",
  authenticateJWT,
  hasRole(["admin", "overseer", "global_overseer"]),
  async (req, res) => {
    try {
      const schools = await User.aggregate([
        {
          $project: { school: { $ifNull: ["$schoolName", "$teacherSchool"] } },
        },
        { $match: { school: { $ne: null } } },
        { $group: { _id: "$school" } },
      ]);
      res.json(schools.map((s) => s._id));
    } catch (e) {
      res.status(500).json({ error: "Failed to retrieve schools." });
    }
  }
);

protectedRouter.get(
  "/admin/schools",
  authenticateJWT,
  hasRole(["global_overseer"]),
  async (req, res) => {
    try {
      const schools = await School.find({}).sort({ schoolName: 1 });
      res.status(200).json(schools);
    } catch (error) {
      logger.error("Error fetching all schools:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.post(
  "/admin/schools/add",
  authenticateJWT,
  hasRole(["overseer", "global_overseer"]),
  validate(schoolSchema),
  async (req, res) => {
    const { schoolName, schoolCountry, tier } = req.body;
    try {
      const newSchool = new School({ schoolName, schoolCountry, tier });
      await newSchool.save();
      res.status(201).json(newSchool);
    } catch (error) {
      if (error.code === 11000) {
        return res
          .status(409)
          .json({ error: "A school with this name already exists." });
      }
      logger.error("Error adding school:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

protectedRouter.patch(
  "/admin/schools/:id",
  authenticateJWT,
  hasRole(["global_overseer"]),
  validate(schoolSchema),
  async (req, res) => {
    const { id } = req.params;
    const { schoolName, schoolCountry, tier } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid school ID." });
    }

    try {
      const updatedSchool = await School.findByIdAndUpdate(
        id,
        { schoolName, schoolCountry, tier },
        { new: true, runValidators: true }
      );

      if (!updatedSchool) {
        return res.status(404).json({ message: "School not found." });
      }

      res.status(200).json({ message: "School updated successfully.", school: updatedSchool });
    } catch (error) {
      if (error.code === 11000) {
        return res
          .status(409)
          .json({ error: "A school with this name already exists." });
      }
      logger.error("Error adding school:", error);
      res.status(500).json({ message: "Server error while updating school." });
    }
  }
);

protectedRouter.get(
  "/overseer/dashboard-overview",
  authenticateJWT,
  hasRole(["overseer"]),
  async (req, res) => {
    const { managedRegions } = req.user;
    if (!managedRegions || managedRegions.length === 0) {
      return res.json({ managedRegions: [] });
    }
    try {
      const overviewData = await Promise.all(
        managedRegions.map(async (region) => {
          const schoolsInRegion = await School.find({ country: region });
          const schoolNames = schoolsInRegion.map((s) => s.name);

          const usersInSchools = await User.find({
            $or: [
              { schoolName: { $in: schoolNames } },
              { teacherSchool: { $in: schoolNames } },
            ],
          });

          const totalAdmins = usersInSchools.filter(
            (u) => u.role === "admin"
          ).length;
          const totalTeachers = usersInSchools.filter(
            (u) => u.role === "teacher"
          ).length;
          const totalStudents = usersInSchools.filter(
            (u) => u.role === "student"
          ).length;

          return {
            name: region,
            totalSchools: schoolNames.length,
            totalAdmins,
            totalTeachers,
            totalStudents,
          };
        })
      );

      res.json({ managedRegions: overviewData });
    } catch (err) {
      logger.error("Failed to get overseer dashboard data:", err);
      res.status(500).json({ error: "Failed to retrieve dashboard data." });
    }
  }
);

protectedRouter.get(
  "/global-overseer/dashboard",
  authenticateJWT,
  hasRole(["global_overseer"]),
  async (req, res) => {
    try {
      const allRegions = await School.distinct("country");

      const overviewData = await Promise.all(
        allRegions.map(async (region) => {
          const schoolsInRegion = await School.find({ country: region });
          const schoolNames = schoolsInRegion.map((s) => s.name);

          const usersInSchools = await User.find({
            $or: [
              { schoolName: { $in: schoolNames } },
              { teacherSchool: { $in: schoolNames } },
            ],
          });

          const totalAdmins = usersInSchools.filter(
            (u) => u.role === "admin"
          ).length;
          const totalTeachers = usersInSchools.filter(
            (u) => u.role === "teacher"
          ).length;
          const totalStudents = usersInSchools.filter(
            (u) => u.role === "student"
          ).length;

          return {
            name: region,
            totalSchools: schoolNames.length,
            totalAdmins,
            totalTeachers,
            totalStudents,
          };
        })
      );

      res.status(200).json({
        managedRegions: overviewData,
        totalUsers: await User.countDocuments(),
      });
    } catch (err) {
      logger.error("Failed to get global overseer dashboard data:", err);
      res.status(500).json({ error: "Failed to retrieve dashboard data." });
    }
  }
);

protectedRouter.get(
  "/global-overseer/users",
  authenticateJWT,
  async (req, res) => {
    try {
      const { search = "" } = req.query;

      if (!["admin", "global_overseer"].includes(req.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      let query = {};
      if (req.user.role === "admin") {
        query.schoolName = req.user.schoolName;
      }

      if (search) {
        query.$or = [
          { firstname: { $regex: search, $options: "i" } },
          { lastname: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const users = await User.find(query)
        .select("firstname lastname email role schoolName schoolCountry createdAt")
        .lean();

      res.json({ users });
    } catch (err) {
      console.error("❌ Error fetching users:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
);


protectedRouter.post(
  "/admin/assign-region",
  authenticateJWT,
  hasRole(["global_overseer"]),
  validate(assignRegionSchema),
  async (req, res) => {
    const { overseerEmail, region } = req.body;
    try {
      const targetUser = await User.findOne({ email: overseerEmail });
      if (!targetUser) {
        return res.status(404).json({ error: "Overseer user not found." });
      }
      if (
        targetUser.role !== "overseer" &&
        targetUser.role !== "global_overseer"
      ) {
        return res
          .status(400)
          .json({ error: "Target user is not an overseer." });
      }
      await User.updateOne(
        { email: overseerEmail },
        {
          $addToSet: { managedRegions: region },
        }
      );

      res.json({
        message: `Successfully assigned region ${region} to overseer ${overseerEmail}.`,
      });
    } catch (e) {
      logger.error("Error assigning region:", e);
      res.status(500).json({ error: "Failed to assign region." });
    }
  }
);

protectedRouter.get(
  "/global-overseer/all-files",
  authenticateJWT,
  hasRole(["global_overseer"]),
  async (req, res) => {
    try {
      const assignments = await Assignment.find({
        attachment_file: { $ne: null },
      }).select("title attachment_file created_by");

      const assignmentFiles = assignments.map((a) => ({
        id: a._id,
        filename: path.basename(a.attachment_file),
        type: "Assignment",
        filePath: a.attachment_file,
        created_by: a.created_by,
      }));

      const submissions = await Submission.find({
        $or: [
          { submission_file: { $ne: null } },
          { feedback_file: { $ne: null } },
        ],
      }).populate("user_id", "email");

      const submissionFiles = submissions.flatMap((s) => {
        const files = [];
        if (s.submission_file) {
          files.push({
            id: s._id,
            filename: path.basename(s.submission_file),
            type: "Submission",
            filePath: s.submission_file,
            uploaded_by: s.user_id ? s.user_id.email : "Unknown",
          });
        }
        if (s.feedback_file) {
          files.push({
            id: s._id,
            filename: path.basename(s.feedback_file),
            type: "Feedback",
            filePath: s.feedback_file,
            uploaded_by: s.user_id ? s.user_id.email : "Unknown",
          });
        }
        return files;
      });

      const allFiles = [...assignmentFiles, ...submissionFiles];

      res.status(200).json({ success: true, files: allFiles });
    } catch (error) {
      logger.error("Error fetching all files for overseer:", error);
      res.status(500).json({ success: false, message: "Failed to retrieve all file data." });
    }
  }
); 

protectedRouter.get(
  "/admin/view-file/:type/:filename",
  authenticateJWT,
  hasRole(["global_overseer"]),
  async (req, res) => {
    try {
      const { type, filename } = req.params;
      let filePath;

      switch (type.toLowerCase()) {
        case "assignment":
          filePath = path.join(__dirname, "uploads", "assignments", filename);
          break;
        case "submission":
          filePath = path.join(__dirname, "uploads", "submissions", filename);
          break;
        case "feedback":
          filePath = path.join(__dirname, "uploads", "feedback", filename);
          break;
        default:
          return res.status(400).json({ message: "Invalid file type." });
      }

      await fs.access(filePath);

      res.sendFile(filePath);
    } catch (error) {
      logger.error("Error serving file for overseer:", error);
      if (error.code === "ENOENT") {
        res.status(404).json({ message: "File not found." });
      } else {
        res
          .status(500)
          .json({ message: "Server error occurred while retrieving file." });
      }
    }
  }
);

protectedRouter.get(
  "/admin/my-school-files",
  authenticateJWT,
  hasRole(["admin"]),
  async (req, res) => {
    try {
      const user = req.user;

      const schoolName = user.schoolName || user.teacherSchool;
      if (!schoolName) {
        return res
          .status(400)
          .json({ error: "User is not associated with a school." });
      }
      const files = await File.find({ school_id: schoolName }).populate(
        "uploader",
        "firstname lastname email"
      );

      const formattedFiles = files.map((file) => ({
        filename: file.filename,
        url: file.url,
        type: file.type,
        submittedBy: file.uploader
          ? `${file.uploader.firstname} ${file.uploader.lastname} (${file.uploader.email})`
          : "Unknown",
      }));

      res.status(200).json(formattedFiles);
    } catch (err) {
      logger.error("Error fetching admin files:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

async function autoSubmitOverdueQuizzes() {
  try {
   
    const quizzes = await Quiz.find({ timeLimitMinutes: { $ne: null } });

    const now = new Date();

    for (const quiz of quizzes) {
      for (const submission of quiz.submissions) {
        if (submission.submitted_at) continue; 

        const startedAt = submission.started_at;
        const dueTime = new Date(startedAt.getTime() + quiz.timeLimitMinutes * 60000);

        if (now >= dueTime) {
          
          let score = 0;
          quiz.questions.forEach((q, index) => {
            if (submission.answers[index] === q.correct) score++;
          });

          submission.score = score;
          submission.submitted_at = now;
          submission.auto_submitted = true;

          await quiz.save();

          eventBus.emit("quiz_auto_submitted", {
            quizId: quiz._id,
            studentId: submission.student_id,
            score
          });

          logger.info(`Auto-submitted quiz ${quiz._id} for student ${submission.student_id}`);
        }
      }
    }
  } catch (err) {
    logger.error('Error in autoSubmitOverdueQuizzes:', err);
  }
}

protectedRouter.get(
  "/teacher/profile",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacher = await User.findById(req.userId).select("-password");
      if (!teacher) {
        return res.status(404).json({ message: "Teacher profile not found." });
      }
      const t = teacher.toObject();
      const computed = getProfileUrl(req, t.profile_picture_url || t.profile_photo_url);
      t.profile_picture_url = computed;
      t.imageUrl = computed;
      t.photoUrl = computed;
      res.status(200).json(t);
    } catch (error) {
      logger.error("Error fetching teacher profile:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.post(
  "/teacher/calendar",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    const { academicYear, terms } = req.body;
    const teacherId = req.userId;

    if (!academicYear || !Array.isArray(terms) || terms.length === 0) {
      return res.status(400).json({ message: "Academic year and at least one term are required." });
    }

    try {
      const teacher = await User.findById(teacherId).populate("school");
      if (!teacher || !teacher.school) {
        return res.status(400).json({ message: "Teacher school not found." });
      }

      const school = teacher.school;

      
      const formattedTerms = terms.map((term, idx) => {
        const termName = term.termName?.trim() || term.name?.trim();
        const startDate = term.startDate || term.date; 
        const endDate = term.endDate || term.date;     
        if (!termName || !startDate || !endDate) {
          throw new Error(`Term ${idx + 1} is missing required fields.`);
        }
        return {
          termName,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        };
      });

  
      let schoolCalendar = await SchoolCalendar.findOne({ school: school._id, academicYear });

      if (schoolCalendar) {
        schoolCalendar.teacher_id = teacherId;
        schoolCalendar.terms = formattedTerms;

        try {
          await schoolCalendar.save();
        } catch (e) {
          logger.error("Update save failed:", e);
          return res.status(500).json({ message: e.message });
        }

        return res.status(200).json({
          message: "Academic calendar updated successfully.",
          calendar: schoolCalendar,
        });
      }

    
      schoolCalendar = new SchoolCalendar({
        teacher_id: teacherId,
        school: school._id,
        schoolName: school.name,
        academicYear,
        terms: formattedTerms,
      });

      try {
        await schoolCalendar.save();
      } catch (e) {
        logger.error("New save failed:", e);
        return res.status(500).json({ message: e.message });
      }

      return res.status(201).json({
        message: "Academic calendar submitted successfully.",
        calendar: schoolCalendar,
      });
    } catch (error) {
      logger.error("Error submitting academic calendar:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.post(
  "/teacher/assignments",
  authenticateJWT,
  hasRole("teacher"),
  localUpload.single("file"),
  async (req, res) => {
    try {
      const toArray = (val) => {
        if (val === undefined || val === null) return [];
        return Array.isArray(val) ? val : [val];
      };

      const teacherId = new mongoose.Types.ObjectId(req.userId);
      let {
        title,
        description,
        due_date,
        assigned_to_users = [],
        assigned_to_grades = [],
        assigned_to_programs = [],
        assigned_to_schools = [],
        assigned_to_other_grades = [],
        recipientType,
        grade,
        assigned_to = [],
      } = req.body;

      if (!title || !due_date) {
        return res.status(400).json({ message: "Title and due_date are required." });
      }

      // Normalize due_date to a valid ISO string or Date
      const due = new Date(due_date);
      if (isNaN(due.getTime())) {
        return res.status(400).json({ message: "Invalid due_date format." });
      }

      // Merge alias into primary field, keep only truthy values
      assigned_to_users = toArray(assigned_to_users).concat(toArray(assigned_to)).filter(Boolean);

      assigned_to_grades = toArray(assigned_to_grades);
      assigned_to_programs = toArray(assigned_to_programs);
      assigned_to_schools = toArray(assigned_to_schools);
      assigned_to_other_grades = toArray(assigned_to_other_grades).map(Number);

      if (recipientType === "class") {
        const teacher = await User.findById(req.userId);
        if (teacher && Array.isArray(teacher.teacherGrade) && teacher.teacherGrade.length > 0) {
          const classQuery = { role: "student", grade: { $in: teacher.teacherGrade } };
          if (teacher.school) classQuery.school = teacher.school;
          const students = await User.find(classQuery).select("_id");
          assigned_to_users = students.map((s) => new mongoose.Types.ObjectId(s._id));
        }
      } else if (recipientType === "otherGrade" && grade) {
        const g = Number(grade);
        if (!assigned_to_other_grades.includes(g)) {
          assigned_to_other_grades.push(g);
        }
      } else if (recipientType === "student") {
        // explicit student selection: leave assigned_to_users as provided
      } else {
        // leave as-is; map schools if provided
        assigned_to_schools = assigned_to_schools.map((id) => {
          try { return new mongoose.Types.ObjectId(id); } catch { return id; }
        });
      }

      // Convert user entries to ObjectIds where possible; keep emails as strings
      assigned_to_users = assigned_to_users.map((val) => {
        try {
          return new mongoose.Types.ObjectId(val);
        } catch {
          return String(val);
        }
      });

      // Ensure uniqueness to avoid duplicate recipients
      const toKey = (v) => (v && v.toString ? v.toString() : String(v));
      const seen = new Set();
      assigned_to_users = assigned_to_users.filter((v) => {
        const k = toKey(v);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      if (
        !assigned_to_users.length &&
        !assigned_to_grades.length &&
        !assigned_to_programs.length &&
        !assigned_to_schools.length &&
        !assigned_to_other_grades.length
      ) {
        return res.status(400).json({
          message:
            "Assignment must be assigned to at least one user, grade, program, or school.",
        });
      }

      const newAssignment = new Assignment({
        teacher_id: teacherId,
        title,
        description,
        file_path: req.file ? `/uploads/assignments/${req.file.filename}` : null,
        due_date: due,
        assigned_to_users,
        assigned_to_grades,
        assigned_to_programs,
        assigned_to_schools,
        assigned_to_other_grades,
      });

      await newAssignment.save();

      eventBus.emit("assignment_created", {
        assignmentId: newAssignment._id,
        title: newAssignment.title,
      });

      res.status(201).json({
        message: "Assignment created successfully",
        assignment: newAssignment,
      });
    } catch (error) {
      logger.error("Error creating assignment:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.patch(
  "/teacher/assignments/:id",
  authenticateJWT,
  hasRole("teacher"),
  localUpload.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const teacherId = new mongoose.Types.ObjectId(req.userId);

      const assignment = await Assignment.findOne({ _id: id, teacher_id: teacherId });
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found or you are not the owner." });
      }

      const { title, description, due_date } = req.body;
      if (title) assignment.title = title;
      if (description) assignment.description = description;
      if (due_date) assignment.due_date = due_date;

      if (req.file) {
        assignment.file_path = `/uploads/assignments/${req.file.filename}`;
      }

      // Note: This doesn't handle re-assigning users, grades, etc.
      // That would be a more complex operation. This just updates the content.

      await assignment.save();

      res.status(200).json({
        message: "Assignment updated successfully",
        assignment,
      });

    } catch (error) {
      logger.error("Error updating assignment:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.post("/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logged out successfully" });
});

protectedRouter.get(
  "/teacher/assignments",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacherId = req.userId;
      const assignments = await Assignment.find({ teacher_id: teacherId }).sort({ createdAt: -1 });
      res.status(200).json(assignments);
    } catch (error) {
      logger.error("Error fetching assignments:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/goals",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const goals = await Goal.find({ user_id: req.userId }).sort({ createdAt: -1 });
      res.status(200).json(goals);
    } catch (error) {
      logger.error("Error fetching student goals:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/budget",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const budget = await Budget.find({ user_id: req.userId }).sort({ createdAt: -1 });
      res.status(200).json(budget);
    } catch (error) {
      logger.error("Error fetching student budget:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/rewards",
  authenticateJWT,
  async (req, res) => {
    try {
      const rewards = await Reward.find({ user_id: req.userId }).sort({ granted_at: -1 });
      
      // Calculate stats
      const totalPoints = rewards.reduce((sum, r) => sum + (r.points || 0), 0);
      const badges = [...new Set(rewards.filter(r => r.type === 'badge').map(r => r.description))];
      
      // Mock term summary for now or calculate based on logic
      const termSummary = `You have earned ${totalPoints} points this term.`;
      const termRewards = rewards.map(r => `${r.points > 0 ? '+' + r.points + ' pts' : 'Badge'}: ${r.description}`);

      res.status(200).json({
        totalPoints,
        badges,
        termSummary,
        termRewards,
        treatSuggestions: ["Watch a movie", "Buy a favorite snack", "Relax for an hour"] // Default suggestions
      });
    } catch (error) {
      logger.error("Error fetching student rewards:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/analytics",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const userId = req.userId;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const activityMap = {};
      // Initialize map for last 7 days
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split("T")[0];
        activityMap[key] = { date: new Date(d), count: 0 };
      }

      // Tasks completed in range (assuming timestamps: true on model)
      const tasks = await StudentTask.find({
        student_id: userId,
        is_completed: true,
        updatedAt: { $gte: start, $lte: end },
      });

      // Submissions in range
      const submissions = await Submission.find({
        user_id: userId,
        submitted_at: { $gte: start, $lte: end },
      });

      tasks.forEach((t) => {
        const k = t.updatedAt.toISOString().split("T")[0];
        if (activityMap[k]) activityMap[k].count++;
      });

      submissions.forEach((s) => {
        const k = s.submitted_at.toISOString().split("T")[0];
        if (activityMap[k]) activityMap[k].count++;
      });

      const labels = [];
      const data = [];

      Object.keys(activityMap).sort().forEach((key) => {
        const entry = activityMap[key];
        labels.push(entry.date.toLocaleDateString("en-US", { weekday: "short" }));
        data.push(entry.count);
      });

      res.json({ labels, data });
    } catch (error) {
      logger.error("Error fetching student analytics:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/submissions",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const submissions = await Submission.find({ user_id: req.userId })
        .populate("assignment_id", "title")
        .sort({ submitted_at: -1 });

      const formatted = submissions.map((s) => ({
        assignment: s.assignment_id,
        submitted_at: s.submitted_at,
        grade: s.feedback_grade,
        feedback: s.feedback_comments,
      }));

      res.status(200).json(formatted);
    } catch (error) {
      logger.error("Error fetching student submissions:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/teacher/submissions",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacherId = req.userId || (req.user && req.user.id);

      const assignments = await Assignment.find({ teacher_id: teacherId })
        .select("_id title due_date")
        .lean();
      const assignmentIds = assignments.map((a) => a._id);

      if (assignmentIds.length === 0) {
        return res.status(200).json([]);
      }

      const submissions = await Submission.find({ assignment_id: { $in: assignmentIds } })
        .populate({ path: "user_id", select: "firstname lastname email" })
        .populate({ path: "assignment_id", select: "title due_date" })
        .sort({ submitted_at: -1 })
        .lean();

      const payload = submissions.map((s) => ({
        _id: s._id,
        assignment: s.assignment_id
          ? { _id: s.assignment_id._id, title: s.assignment_id.title, due_date: s.assignment_id.due_date }
          : null,
        student: s.user_id
          ? { _id: s.user_id._id, firstname: s.user_id.firstname, lastname: s.user_id.lastname, email: s.user_id.email }
          : null,
        submission_text: s.submission_text || "",
        submission_file: s.submission_file || "",
        submitted_at: s.submitted_at || s.createdAt || null,
        feedback_grade: s.feedback_grade ?? null,
        feedback_comments: s.feedback_comments ?? null,
      }));

      return res.status(200).json(payload);
    } catch (err) {
      logger.error("Error fetching teacher submissions:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);
protectedRouter.post(
  "/teacher/submissions/:submissionId/grade",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { score, feedback } = req.body;

      const submission = await Submission.findById(submissionId);
      if (!submission) return res.status(404).json({ message: "Submission not found." });

      submission.feedback_grade = score;
      submission.feedback_comments = feedback;
      await submission.save();

      res.status(200).json({ message: "Submission graded successfully.", submission });
    } catch (error) {
      logger.error("Error grading submission:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.post(
  "/teacher/feedback/:submissionId",
  authenticateJWT,
  hasRole("teacher"),
  localUpload.single("feedbackFile"),
  async (req, res) => {
    try {
      const { feedback_grade, feedback_comments } = req.body;
      const { submissionId } = req.params;

      const submission = await Submission.findById(submissionId).populate("assignment_id");
      if (!submission) return res.status(404).json({ message: "Submission not found" });

      const assignment = submission.assignment_id;
      if (!assignment || assignment.teacher_id !== req.userId) {
        return res.status(403).json({ message: "Not authorized to give feedback" });
      }

      submission.feedback_grade = feedback_grade || submission.feedback_grade;
      submission.feedback_comments = feedback_comments || submission.feedback_comments;
      submission.feedback_file = req.file ? `/uploads/feedback/${req.file.filename}` : submission.feedback_file;
      submission.feedback_given_at = new Date();

      await submission.save();
      res.status(200).json({ message: "Feedback saved", submission });
    } catch (error) {
      logger.error("Error giving feedback:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.get(
  "/teacher/quizzes",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const quizzes = await Quiz.find({ teacher_id: req.userId }).sort({ createdAt: -1 });
      res.status(200).json(quizzes);
    } catch (error) {
      logger.error("Error fetching teacher quizzes:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/teacher/quizzes/:quizId/submissions",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const quiz = await Quiz.findById(quizId).populate({
        path: "submissions.student_id",
        select: "firstname lastname email"
      });
      if (!quiz) return res.status(404).json({ message: "Quiz not found." });
      if (String(quiz.teacher_id) !== String(req.userId)) {
        return res.status(403).json({ message: "Not authorized to view this quiz submissions." });
      }

      const submissions = quiz.submissions.map((sub) => {
        const details = sub.answers.map(ans => {
          const question = quiz.questions.id(ans.questionId);
          return {
            question: question ? question.question : 'Unknown Question',
            questionType: question ? question.type : 'unknown',
            studentAnswer: ans.answer,
            isCorrect: ans.isCorrect,
            pointsAwarded: ans.pointsAwarded,
            pointsPossible: question ? question.points : 1,
            questionId: ans.questionId
          };
        });

        return {
          _id: sub._id,
          student: sub.student_id,
          score: sub.score,
          status: sub.status,
          submitted_at: sub.submitted_at,
          auto_submitted: sub.auto_submitted,
          details,
        };
      });

      res.status(200).json({ quizTitle: quiz.title, submissions });
    } catch (err) {
      logger.error("Error fetching quiz submissions:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.patch(
  "/teacher/submissions/:submissionId/grade",
  authenticateJWT,
  hasRole(["teacher"]),
  async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { gradedAnswers } = req.body; // Expects [{ questionId: "...", points: 2 }]

      if (!Array.isArray(gradedAnswers)) {
        return res.status(400).json({ message: "gradedAnswers must be an array." });
      }

      const quiz = await Quiz.findOne({ "submissions._id": submissionId });
      if (!quiz) {
        return res.status(404).json({ message: "Submission not found." });
      }

      if (quiz.teacher_id.toString() !== req.userId) {
        return res.status(403).json({ message: "You are not authorized to grade this submission." });
      }

      const submission = quiz.submissions.id(submissionId);
      if (!submission) {
        return res.status(404).json({ message: "Submission not found within the quiz." });
      }

      let totalScore = 0;

      submission.answers.forEach(answerDetail => {
        const manualGrade = gradedAnswers.find(g => g.questionId === answerDetail.questionId.toString());
        const question = quiz.questions.id(answerDetail.questionId);

        if (manualGrade && question && question.type === 'short-answer') {
          const awarded = Number(manualGrade.points);
          answerDetail.pointsAwarded = Math.min(Math.max(0, awarded), question.points || 1);
          answerDetail.isCorrect = answerDetail.pointsAwarded > 0;
        }
        
        totalScore += answerDetail.pointsAwarded;
      });

      submission.score = totalScore;
      submission.status = 'graded';

      await quiz.save();

      eventBus.emit("quiz_graded", { quizId: quiz._id, studentId: submission.student_id, score: submission.score });

      res.status(200).json({ message: "Quiz graded successfully.", submission });

    } catch (error) {
      logger.error("Error grading submission:", error);
      res.status(500).json({ message: "Server error while grading." });
    }
  }
);

// GET: /api/quizzes/:quizId/ranks - returns ranking for the quiz for teachers/students
protectedRouter.get(
  "/quizzes/:quizId/ranks",
  authenticateJWT,
  hasRole(["teacher", "student"]),
  async (req, res) => {
    try {
      const { quizId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(quizId)) return res.status(400).json({ message: "Invalid quiz ID." });

      const quiz = await Quiz.findById(quizId).populate("submissions.student_id", "firstname lastname email");
      if (!quiz) return res.status(404).json({ message: "Quiz not found." });

      // Access: teacher or student who is assigned
      if (req.user.role === "teacher") {
        if (String(quiz.teacher_id) !== String(req.userId)) {
          return res.status(403).json({ message: "Not authorized." });
        }
      } else if (req.user.role === "student") {
        const student = await User.findById(req.userId).select("_id email grade schoolName");
        const allowed =
          quiz.assigned_to_users.some(u => String(u) === String(student._id)) ||
          quiz.assigned_to_grades.includes(student.grade) ||
          quiz.assigned_to_schools.some(s => String(s) === String(student.school)) ||
          quiz.assigned_to_other_grades.includes(student.grade);
        if (!allowed) return res.status(403).json({ message: "Not authorized for this quiz." });
      }

      const ranks = quiz.submissions
        .filter(s => typeof s.score === 'number')
        .map(s => ({
          student: s.student_id,
          score: s.score,
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, index) => ({ position: index + 1, ...entry }));

      res.status(200).json({ quizTitle: quiz.title, ranks });
    } catch (err) {
      logger.error("Error fetching quiz ranks:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.post(
  "/teacher/quizzes",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        due_date,
        timeLimitMinutes,
        questions,
        assigned_to_users = [],
        assigned_to_grades = [],
        assigned_to_programs = [],
        assigned_to_schools = [],
        assigned_to_other_grades = [],
      } = req.body;

      // normalize arrays and convert ids to ObjectId where applicable
      const normAssignedUsers = Array.isArray(assigned_to_users)
        ? assigned_to_users.map((id) => {
            try {
              return new mongoose.Types.ObjectId(id);
            } catch (e) {
              return null;
            }
          }).filter(Boolean)
        : [];

      const normAssignedSchools = Array.isArray(assigned_to_schools)
        ? assigned_to_schools.map((id) => {
            try {
              return new mongoose.Types.ObjectId(id);
            } catch (e) {
              return null;
            }
          }).filter(Boolean)
        : [];

      if (
        !normAssignedUsers.length &&
        !assigned_to_grades.length &&
        !assigned_to_programs.length &&
        !normAssignedSchools.length &&
        !assigned_to_other_grades.length
      ) {
        return res.status(400).json({
          message:
            "Quiz must be assigned to at least one user, grade, program, or school.",
        });
      }

      const quiz = new Quiz({
        teacher_id: req.userId,
        title,
        description,
        due_date,
        timeLimitMinutes,
        questions,
        assigned_to_users: normAssignedUsers,
        assigned_to_grades,
        assigned_to_programs,
        assigned_to_schools: normAssignedSchools,
        assigned_to_other_grades,
      });

      await quiz.save();

     
      eventBus.emit("quiz_created", {
        quizId: quiz._id,
        title: quiz.title,
      });

      
      const reminderHours = [6, 2];
      for (const hoursBefore of reminderHours) {
        const remindTime = new Date(due_date);
        remindTime.setHours(remindTime.getHours() - hoursBefore);
        if (remindTime > new Date()) {
          await agenda.schedule(remindTime, "quiz_reminder", {
            quizId: quiz._id,
            hoursBefore,
          });
        }
      }

      res.status(201).json({ message: "Quiz created successfully", quiz });
    } catch (error) {
      logger.error("Error creating quiz:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.get(
  "/teacher/overdue-tasks",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const now = new Date();
      const teacherId = req.userId;
      const overdueAssignments = await Assignment.find({
        teacher_id: teacherId,
        due_date: { $lt: now },
      });

      res.status(200).json(overdueAssignments);
    } catch (error) {
      logger.error("Error fetching overdue tasks:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.get(
  "/teacher/assigned-tasks",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const assignedTasks = await Assignment.find({ teacher_id: req.userId });
      res.status(200).json(assignedTasks);
    } catch (error) {
      logger.error("Error fetching assigned tasks:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/teacher/quiz-summaries",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacherId = req.userId;
      const quizzes = await Quiz.find({ teacher_id: teacherId }).select("title questions submissions");
      const summaries = quizzes.map(q => {
        const count = q.submissions?.length || 0;
        const scores = q.submissions?.filter(s => typeof s.score === 'number').map(s => s.score) || [];
        const avg = scores.length ? (scores.reduce((a,b) => a + b, 0) / scores.length) : null;
        return { quizId: q._id, title: q.title, questionsCount: q.questions?.length || 0, submissionsCount: count, averageScore: avg };
      });
      res.status(200).json(summaries);
    } catch (err) {
      logger.error("Error fetching quiz summaries:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/teacher/feedback",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacherId = req.userId;
      const teacherAssignments = await Assignment.find({ teacher_id: teacherId }).select("_id");
      const assignmentIds = teacherAssignments.map((a) => a._id);

      const submissionsWithFeedback = await Submission.find({
        assignment_id: { $in: assignmentIds },
        $or: [{ feedback_grade: { $ne: null } }, { feedback_comments: { $ne: null } }],
      }).populate({ path: "user_id", select: "email", model: User });

      const formattedFeedback = submissionsWithFeedback.map((f) => ({
        student_email: f.user_id?.email,
        message: f.feedback_comments || `Graded: ${f.feedback_grade}`,
        file_name: f.feedback_file,
      }));

      res.status(200).json(formattedFeedback);
    } catch (error) {
      logger.error("Error fetching feedback:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.post(
  "/teacher/message",
  authenticateJWT,
  hasRole(["teacher"]),
  async (req, res) => {
    let { assigned_to_users = [], assigned_to_grades = [], message } = req.body;

    const toArray = (val) => (Array.isArray(val) ? val : [val].filter(Boolean));
    assigned_to_users = toArray(assigned_to_users);
    assigned_to_grades = toArray(assigned_to_grades);

    try {
      let studentIds = [];

      if (assigned_to_users.length > 0) {
        const students = await User.find({
          _id: { $in: assigned_to_users.map(id => id.toString()) },
          role: "student",
        });
        studentIds.push(...students.map(s => s._id));
      }

      if (assigned_to_grades.length > 0) {
        const gradeStudents = await User.find({
          grade: { $in: assigned_to_grades },
          role: "student",
        });
        studentIds.push(...gradeStudents.map(s => s._id));
      }

      studentIds = [...new Set(studentIds.map(id => id.toString()))]; // unique

      if (studentIds.length === 0) {
        return res.status(400).json({ message: "No students selected." });
      }

      
      const savedMessages = [];
      for (const id of studentIds) {
        const msg = new Message({
          sender: req.userId,
          recipient: id,
          content: message,
        });
        await msg.save();
        savedMessages.push(msg);

        
        eventBus.emit("teacher_message", {
          userId: id,
          message,
          teacherName: req.user.firstname,
        });
      }

      res.status(200).json({ message: "Message sent successfully!", studentIds, savedMessages });
    } catch (error) {
      logger.error("Error sending message:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

protectedRouter.get(
  "/teacher/students/other",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacher = await User.findById(req.userId);
      if (!teacher || (!teacher.school && !teacher.schoolName) || !Array.isArray(teacher.teacherGrade) || teacher.teacherGrade.length === 0) {
        return res.status(200).json([]);
      }

      const { search } = req.query;
      const schoolQuery = {
        role: "student",
        grade: { $nin: teacher.teacherGrade },
      };

      if (teacher.school) {
        schoolQuery.school = teacher.school;
      } else if (teacher.schoolName) {
        schoolQuery.schoolName = teacher.schoolName;
      }

      if (search) {
        schoolQuery.$or = [
          { firstname: { $regex: search, $options: "i" } },
          { lastname: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const otherStudents = await User.find(schoolQuery).select("firstname lastname email grade profile_picture_url");
      const mappedOther = otherStudents.map(s => ({
        _id: s._id,
        firstname: s.firstname,
        lastname: s.lastname,
        email: s.email,
        grade: s.grade,
        profile_picture_url: getProfileUrl(req, s.profile_picture_url || s.profile_photo_url),
        imageUrl: getProfileUrl(req, s.profile_picture_url || s.profile_photo_url),
      }));
      res.status(200).json(mappedOther);
    } catch (error) {
      logger.error("Error fetching students from other classes:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/teacher/students",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacher = await User.findById(req.userId);
      if (!teacher || (!teacher.school && !teacher.schoolName) || !Array.isArray(teacher.teacherGrade) || teacher.teacherGrade.length === 0) {
        return res.status(200).json([]);
      }

      const { search } = req.query;
      const schoolQuery = {
        role: "student",
        grade: { $in: teacher.teacherGrade },
      };

      if (teacher.school) {
        schoolQuery.school = teacher.school;
      } else if (teacher.schoolName) {
        schoolQuery.schoolName = teacher.schoolName;
      }

      if (search) {
        schoolQuery.$or = [
          { firstname: { $regex: search, $options: "i" } },
          { lastname: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const students = await User.find(schoolQuery).select("firstname lastname email grade profile_picture_url");
      const mappedStudents = students.map(s => ({
        _id: s._id,
        firstname: s.firstname,
        lastname: s.lastname,
        email: s.email,
        grade: s.grade,
        profile_picture_url: getProfileUrl(req, s.profile_picture_url || s.profile_photo_url),
        imageUrl: getProfileUrl(req, s.profile_picture_url || s.profile_photo_url),
      }));
      res.status(200).json(mappedStudents || []);
    } catch (error) {
      logger.error("Error fetching students for teacher's class:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


// Aggregated list of assignable students for teacher UIs
protectedRouter.get(
  "/teacher/assignable-students",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacher = await User.findById(req.user.id).populate("school");
      if (!teacher) return res.status(404).json({ message: "Teacher not found." });

      const { search } = req.query;

      // 1) My grade students
      let myGradeQuery = { role: "student", grade: { $in: teacher.teacherGrade } };
      if (teacher.school) myGradeQuery.school = teacher.school._id;
      if (search) myGradeQuery.$or = [
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
      const myGradeStudents = await User.find(myGradeQuery).select("_id firstname lastname email grade school");

      // 2) Other students in same school (excluding my grades)
      let otherQuery = { role: "student", grade: { $nin: teacher.teacherGrade } };
      if (teacher.school) otherQuery.school = teacher.school._id;
      if (search) otherQuery.$or = [
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
      const otherStudents = await User.find(otherQuery).select("_id firstname lastname email grade school profile_picture_url profile_photo_url");

      // 3) Special linked students (cross-school)
      const specialLinks = await SpecialLink.find({
        $or: [{ teacher_id: teacher._id }, { student_id: teacher._id }],
        status: "active",
      })
        .populate("teacher_id", "_id firstname lastname email school")
        .populate("student_id", "_id firstname lastname email school");

      const specialConnections = specialLinks.map((l) => {
        const isTeacher = l.teacher_id._id.toString() === teacher._id.toString();
        const partner = isTeacher ? l.student_id : l.teacher_id;
        return { _id: partner._id, firstname: partner.firstname, lastname: partner.lastname, email: partner.email, school: partner.school, profile_picture_url: getProfileUrl(req, partner.profile_picture_url || partner.profile_photo_url), imageUrl: getProfileUrl(req, partner.profile_picture_url || partner.profile_photo_url) };
      });

      // 4) Available grades in school
      const gradePipeline = [{ $match: { role: "student" } }];
      if (teacher.school) gradePipeline.push({ $match: { school: teacher.school._id } });
      gradePipeline.push({ $group: { _id: "$grade" } }, { $sort: { _id: 1 } });
      const gradesAgg = await User.aggregate(gradePipeline);
      const availableGrades = gradesAgg.map((g) => g._id).filter((g) => g != null);

      // compute profile URLs for myGrade and otherStudents
      const mapWithPhoto = (arr) => arr.map(s => ({ ...s.toObject ? s.toObject() : s, profile_picture_url: getProfileUrl(req, s.profile_picture_url || s.profile_photo_url), imageUrl: getProfileUrl(req, s.profile_picture_url || s.profile_photo_url) }));
      res.status(200).json({ myGradeStudents: mapWithPhoto(myGradeStudents), otherStudents: mapWithPhoto(otherStudents), specialConnections, availableGrades });
    } catch (err) {
      logger.error("Error building assignable students list:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

protectedRouter.get("/auth/check", authenticateJWT, (req, res) => {
  (async () => {
    try {
      const user = await User.findById(req.userId).select("firstname lastname email role profile_picture_url profile_photo_url");
      if (!user) return res.status(404).json({ status: false, message: "User not found." });
      const photo = getProfileUrl(req, user.profile_picture_url || user.profile_photo_url);
      res.json({
        status: true,
        message: "Authenticated",
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          firstname: user.firstname,
          lastname: user.lastname,
          profile_picture_url: photo,
          imageUrl: photo,
          photoUrl: photo,
        },
      });
    } catch (err) {
      console.error("auth/check error:", err);
      res.status(500).json({ status: false, message: "Server error" });
    }
  })();
});



protectedRouter.get(
  "/student/assignments",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const student = await User.findById(req.user.id).populate("school");
      if (!student) return res.status(404).json({ message: "Student not found." });

     
      const studentIdObj = new mongoose.Types.ObjectId(student._id);
      const studentEmail = student.email || null;
      const studentGrade = student.grade || null;
      const studentProgram = student.program || null;
      const studentSchool = student.school?._id
        ? new mongoose.Types.ObjectId(student.school._id)
        : null;

      const conditions = [
        { assigned_to_users: { $in: [studentIdObj] } },
      ];

      if (studentProgram) {
        conditions.push({ assigned_to_programs: { $in: [studentProgram] } });
      }

      if (studentSchool) {
        conditions.push({ assigned_to_schools: { $in: [studentSchool] } });
      }

      if (student.educationLevel === "university" && student.uniLevel) {
        conditions.push({ assigned_to_levels: { $in: [student.uniLevel] } });
      } else if (studentGrade) {
        conditions.push({ assigned_to_grades: { $in: [studentGrade] } });
        conditions.push({ assigned_to_other_grades: { $in: [studentGrade] } });
      }

      console.log("🔎 Student info:", {
        id: studentIdObj,
        email: studentEmail,
        grade: studentGrade,
        program: studentProgram,
        school: studentSchool,
      });
      console.log("📝 Query conditions:", JSON.stringify(conditions, null, 2));

      const assignments = await Assignment.find({ $or: conditions }).sort({ due_date: 1 });

      console.log("📦 Assignments found:", assignments.length);

      res.status(200).json(assignments);
    } catch (error) {
      logger.error("Error fetching student assignments:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);



protectedRouter.post(
  '/student/tasks',
  authenticateJWT,
  hasRole('student'),
  async (req, res) => {
    try {
      console.log('JWT userId:', req.userId); 

      const { title, description, due_date } = req.body;

      if (!title || !due_date) {
        return res.status(400).json({ message: 'Title and due_date are required.' });
      }

      const dueDate = new Date(due_date);
      if (isNaN(dueDate.getTime())) {
        return res.status(400).json({ message: 'Invalid due_date.' });
      }

      if (!req.userId) {
        return res.status(401).json({ message: 'Unauthorized: user ID missing.' });
      }

      const newTask = new StudentTask({
        student_id: req.userId,
        title,
        description: description || '',
        due_date: dueDate,
      });

      const savedTask = await newTask.save();

   
      eventBus.emit('task_created', {
        taskId: savedTask._id,
        studentId: req.userId,
        title: savedTask.title,
      });
    

      res.status(201).json({ message: 'Task created successfully', task: savedTask });

    } catch (error) {
      logger.error('Error creating student task:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);


protectedRouter.get(
  "/student/tasks",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      console.log("Fetching tasks for user:", req.userId);

      const tasks = await StudentTask.find({ student_id: req.userId }).sort({
        due_date: 1,
      });

      res.set("Cache-Control", "no-store"); 
      res.json(tasks); 
    } catch (error) {
      logger.error("Error fetching student tasks:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

protectedRouter.patch(
  '/student/tasks/:id/complete',
  authenticateJWT,
  hasRole('student'),
  async (req, res) => {
    try {
      const task = await StudentTask.findOneAndUpdate(
        { _id: req.params.id, student_id: req.userId },
        { is_completed: true },
        { new: true }
      );

      if (!task) {
        return res.status(404).json({ message: 'Task not found.' });
      }

      res.status(200).json({ message: 'Task marked as completed', task });

    } catch (error) {
      logger.error('Error marking task complete:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);


protectedRouter.post(
  "/student/submissions",
  authenticateJWT,
  hasRole("student"),
  localUpload.single("file"),
  async (req, res) => {
    try {
      const { assignmentId, submissionText } = req.body;
      const studentId = req.user.id;

      if (!assignmentId) {
        return res
          .status(400)
          .json({ message: "Missing required fields: assignmentId." });
      }

      const newSubmission = new Submission({
        assignment_id: assignmentId,
        user_id: studentId,
        submission_file: req.file
          ? `/uploads/submissions/${req.file.filename}`
          : null,
        submission_text: submissionText || null,
        submitted_at: new Date(),
      });

      await newSubmission.save();
      eventBus.emit("new_submission", {
        assignmentId,
        studentId,
      });

      res.status(201).json({
        message: "Submission successful!",
        submission: newSubmission,
      });
    } catch (error) {
      logger.error("Error submitting assignment:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/quizzes",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const student = await User.findById(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found." });

      const quizzes = await Quiz.find({
        $or: [
          { assigned_to_users: student._id },
          { assigned_to_grades: student.grade },
          { assigned_to_schools: student.school },
        ],
      });


      for (const quiz of quizzes) {
        let submission = quiz.submissions.find(
          sub => sub.student_id.toString() === student._id.toString()
        );
        if (!submission) {
          const now = new Date();
          quiz.submissions.push({
            student_id: student._id,
            answers: [],
            started_at: now,
          });
          await quiz.save();
          // Schedule auto-submit if the quiz has a time limit
          if (quiz.timeLimitMinutes && Number(quiz.timeLimitMinutes) > 0) {
            const runAt = new Date(now.getTime() + quiz.timeLimitMinutes * 60000);
            try {
              await agenda.schedule(runAt, "auto_submit_quiz", {
                quizId: quiz._id,
                studentId: student._id,
              });
            } catch (e) {
              logger.error(`Failed to schedule auto_submit_quiz for quiz ${quiz._id}, student ${student._id}: ${e.message}`);
            }
          }
        }
      }

      // sanitize quizzes: remove 'correct' answers from questions before sending to student
      const sanitized = quizzes.map(q => {
        const obj = q.toObject();
        obj.questions = (obj.questions || []).map(qq => ({ question: qq.question, options: qq.options }));
        return obj;
      });
      res.status(200).json({ quizzes: sanitized });
    } catch (error) {
      logger.error("Error fetching student quizzes:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.post(
  "/student/quizzes/:quizId/submit",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const { quizId } = req.params;
      const { answers, finalize, autoSubmit } = req.body;

      const student = await User.findById(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found." });

      const quiz = await Quiz.findById(quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz not found." });

   
      const allowed =
        quiz.assigned_to_users.includes(student.email) ||
        quiz.assigned_to_grades.includes(student.grade) ||
        quiz.assigned_to_schools.includes(student.schoolName);

      if (!allowed) return res.status(403).json({ message: "Not authorized for this quiz." });

     
      let submission = quiz.submissions.find(
        sub => String(sub.student_id) === String(student._id)
      );

      if (!submission) {
        submission = {
          student_id: student._id,
          answers: [],
          score: 0,
          started_at: new Date(),
          submitted_at: null,
          auto_submitted: false
        };
        quiz.submissions.push(submission);
      }

     
      submission.answers = answers;

      if (finalize || (quiz.timeLimitMinutes && autoSubmit)) {
        let autoGradedScore = 0;
        let hasManualGrading = false;
        const answerDetails = [];

        quiz.questions.forEach((q, index) => {
          const studentAnswer = answers[q._id] !== undefined ? answers[q._id] : answers[index];
          let isCorrect = null;
          let pointsAwarded = 0;

          if (q.type === 'multiple-choice') {
          isCorrect = studentAnswer && q.correct.includes(studentAnswer);
            if (isCorrect) pointsAwarded = q.points || 1;
          } else if (q.type === 'checkboxes') {
            const sortedStudent = Array.isArray(studentAnswer) ? [...studentAnswer].sort() : [];
            const sortedCorrect = Array.isArray(q.correct) ? [...q.correct].sort() : [];
            isCorrect = JSON.stringify(sortedStudent) === JSON.stringify(sortedCorrect);
            if (isCorrect) pointsAwarded = q.points || 1;
          } else if (q.type === 'short-answer') {
            hasManualGrading = true;
            isCorrect = null;
            pointsAwarded = 0;
          }
          
          autoGradedScore += pointsAwarded;

          answerDetails.push({
            questionId: q._id,
            answer: studentAnswer,
            isCorrect: isCorrect,
            pointsAwarded: pointsAwarded
          });
        });

        submission.answers = answerDetails;
        submission.score = autoGradedScore;
        submission.submitted_at = new Date();
        submission.auto_submitted = !!autoSubmit;
        submission.status = hasManualGrading ? 'submitted' : 'graded';
      }

      await quiz.save();

      res.status(201).json({
        message: finalize ? "Quiz submitted successfully!" : "Answers auto-saved.",
        score: submission.score,
        total: quiz.questions.length,
        submission,
        quiz
      });

    } catch (error) {
      logger.error("Error submitting quiz:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.get(
  "/student/quizzes/:quizId/result",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const quiz = await Quiz.findById(req.params.quizId).populate("submissions.student_id", "firstname lastname email");
      if (!quiz) return res.status(404).json({ message: "Quiz not found." });

      const submission = quiz.submissions.find(sub => sub.student_id._id.toString() === req.user.id);
      if (!submission) return res.status(404).json({ message: "No submission found for this student." });

      res.status(200).json({
        quizTitle: quiz.title,
        submittedAt: submission.submitted_at,
        score: submission.score,
            answers: submission.answers,
            details: quiz.questions.map((q, idx) => ({
              question: q.question || null,
              options: q.options || [],
              studentAnswer: submission.answers?.[idx] ?? null,
              correctAnswer: q.correct,
              isCorrect: submission.answers?.[idx] === q.correct,
            })),
        autoSubmitted: submission.auto_submitted
      });
    } catch (error) {
      logger.error("Error fetching student quiz result:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/quizzes/:quizId",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const student = await User.findById(req.user.id);
      if (!student) return res.status(404).json({ message: "Student not found." });

      const quiz = await Quiz.findById(req.params.quizId);
      if (!quiz) return res.status(404).json({ message: "Quiz not found." });

      const allowed =
        quiz.assigned_to_users.includes(student.email) ||
        quiz.assigned_to_grades.includes(student.grade) ||
        quiz.assigned_to_schools.includes(student.schoolName);

      if (!allowed) {
        return res.status(403).json({ message: "Not authorized for this quiz." });
      }

      // ensure a submission record exists and schedule auto submit if needed
      let submission = quiz.submissions.find((sub) => String(sub.student_id) === String(student._id));
      if (!submission) {
        const now = new Date();
        quiz.submissions.push({ student_id: student._id, answers: [], started_at: now });
        await quiz.save();
        if (quiz.timeLimitMinutes && Number(quiz.timeLimitMinutes) > 0) {
          const runAt = new Date(now.getTime() + quiz.timeLimitMinutes * 60000);
          try {
            await agenda.schedule(runAt, "auto_submit_quiz", { quizId: quiz._id, studentId: student._id });
          } catch (e) {
            logger.error(`Failed to schedule auto_submit_quiz for quiz ${quiz._id}, student ${student._id}: ${e.message}`);
          }
        }
      }
      // return sanitized quiz (hide correct answers)
      const safeQuiz = quiz.toObject();
      safeQuiz.questions = (safeQuiz.questions || []).map(q => ({
        _id: q._id,
        question: q.question,
        options: q.options,
        type: q.type,
        points: q.points
      }));

      // Shuffle questions for the student
      for (let i = safeQuiz.questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [safeQuiz.questions[i], safeQuiz.questions[j]] = [safeQuiz.questions[j], safeQuiz.questions[i]];
      }

      res.status(200).json({ quiz: safeQuiz });
    } catch (error) {
      logger.error("Error fetching quiz:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/teachers",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const student = await User.findById(req.user.id);

      if (!student || (!student.school && !student.schoolName)) {
        return res.status(200).json([]);
      }

      const { search } = req.query;
      const schoolQuery = { role: "teacher" };

      if (student.school) {
        schoolQuery.school = student.school;
      } else if (student.schoolName) {
        schoolQuery.schoolName = student.schoolName;
      }

      if (search) {
        schoolQuery.$or = [
          { firstname: { $regex: search, $options: "i" } },
          { lastname: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { teacherSubject: { $regex: search, $options: "i" } },
        ];
      }

      const teachers = await User.find(schoolQuery)
        .select("firstname lastname email teacherSubject profile_picture_url");

      // Convert to frontend-friendly keys
      const mappedTeachers = (teachers || []).map(t => ({
        firstname: t.firstname,
        lastname: t.lastname,
        email: t.email,
        teacherSubject: t.teacherSubject,
        profile_picture_url: getProfileUrl(req, t.profile_picture_url || t.profile_photo_url),
        imageUrl: getProfileUrl(req, t.profile_picture_url || t.profile_photo_url),
        photoUrl: getProfileUrl(req, t.profile_picture_url || t.profile_photo_url),
      }));
      res.status(200).json({ teachers: mappedTeachers });
    } catch (err) {
      logger.error("Error fetching teachers for student:", err);
      res.status(500).json({ message: "Failed to fetch teachers" });
    }
  }
);

protectedRouter.post(
  "/messages",
  authenticateJWT,
  async (req, res) => {
    try {
      const { recipientId, content } = req.body;
      if (!recipientId || !content) return res.status(400).json({ message: "Recipient and content required" });

      const msg = new Message({
        sender: req.userId,
        recipient: recipientId,
        content
      });
      await msg.save();
      res.status(201).json(msg);
    } catch (err) {
      logger.error("Error sending message:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/messages",
  authenticateJWT,
  async (req, res) => {
    try {
      const messages = await Message.find({
        $or: [{ recipient: req.userId }, { sender: req.userId }]
      })
      .populate('sender', 'firstname lastname email role')
      .populate('recipient', 'firstname lastname email role')
      .sort({ createdAt: -1 });
      res.status(200).json(messages);
    } catch (err) {
      logger.error("Error fetching messages:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.post(
  "/upload/local",
  localUpload.single("file"),
  (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file was uploaded." });
      }
      res.status(200).json({
        success: true,
        message: "File uploaded locally!",
        filePath: req.file.path,
        fileName: req.file.filename,
      });
    } catch (error) {
      console.error("❌ Local upload error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to upload file." });
    }
  }
);

protectedRouter.get(
  "/student/submissions/:filename",
  hasRole("student", "teacher", "admin", "global_overseer"),
  async (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(dirs.submissions, filename);
      const userId = req.user.id;
      const userRole = req.user.role;
      await fs.access(filePath);
      let isAuthorized = false;
      if (userRole === "global_overseer" || userRole === "admin") {
        isAuthorized = true;
      } else {
        const submission = await Submission.findOne({
          submission_file: `/uploads/submissions/${filename}`,
        }).populate("user_id");
        if (submission) {
          if (
            userRole === "student" &&
            submission.user_id._id.toString() === userId
          ) {
            isAuthorized = true;
          } else if (
            userRole === "teacher" &&
            submission.user_id.schoolName === req.user.schoolName &&
            submission.user_id.grade === req.user.grade
          ) {
            isAuthorized = true;
          }
        }
      }
      if (isAuthorized) {
        res.sendFile(filePath);
      } else {
        res
          .status(403)
          .json({
            message: "Forbidden. You do not have permission to view this file.",
          });
      }
    } catch (error) {
      logger.error("Error serving student submission file:", error);
      if (error.code === "ENOENT") {
        res.status(404).json({ message: "File not found." });
      } else {
        res
          .status(500)
          .json({ message: "Server error occurred while retrieving file." });
      }
    }
  }
);

protectedRouter.get(
  "/teacher/assignments/:filename",
  authenticateJWT,
  hasRole(["student", "teacher", "admin", "global_overseer"]),
  async (req, res) => {
    try {
      const { filename } = req.params;

      // Prevent path traversal and invalid names
      if (!filename || filename !== path.basename(filename) || /[\/\\]/.test(filename)) {
        return res.status(400).json({ message: "Invalid filename." });
      }

      // Find assignment using stored file path (exact match)
      const storedPath = `/uploads/assignments/${filename}`;
      const assignment = await Assignment.findOne({
        $or: [
          { file_path: storedPath },
          { attachment_file: storedPath },
        ],
      }).lean();

      if (!assignment) {
        return res.status(404).json({ message: "File not found." });
      }

      // Authorization
      const role = req.user.role;
      const userId = String(req.user.id);
      let authorized = false;

      if (role === "global_overseer" || role === "admin") {
        authorized = true;
      } else if (role === "teacher" && String(assignment.teacher_id) === userId) {
        authorized = true;
      } else if (role === "student") {
        authorized = isStudentAssignedToAssignment(assignment, req.user);
      }

      if (!authorized) {
        return res.status(403).json({ status: false, message: "Sorry, you are not authorized to view this resource." });
      }

      // Serve file from local uploads directory
      const filePath = path.join(dirs.assignments, filename);
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ message: "File not found." });
      }

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      return res.sendFile(filePath);
    } catch (error) {
      logger.error("Error serving assignment file:", error);
      return res.status(500).json({ message: "Server error occurred while retrieving file." });
    }
  }
);
// Secure download of student submission files for teachers/admins
protectedRouter.get(
  "/teacher/submissions/files/:filename",
  authenticateJWT,
  hasRole(["teacher", "admin", "global_overseer"]),
  async (req, res) => {
    try {
      const { filename } = req.params;

      // Prevent path traversal
      if (!filename || filename !== path.basename(filename) || /[\/\\]/.test(filename)) {
        return res.status(400).json({ message: "Invalid filename." });
      }

      // Ensure the submission exists and belongs to one of the teacher's assignments
      const storedPath = `/uploads/submissions/${filename}`;
      const submission = await Submission.findOne({ submission_file: storedPath }).select("assignment_id");
      if (!submission) {
        return res.status(404).json({ message: "File not found." });
      }

      const assignment = await Assignment.findById(submission.assignment_id).select("teacher_id").lean();
      if (!assignment) {
        return res.status(404).json({ message: "File not found." });
      }

      const role = req.user.role;
      const teacherId = String(req.user.id);
      if (!(role === "global_overseer" || role === "admin" || String(assignment.teacher_id) === teacherId)) {
        return res.status(403).json({ message: "Forbidden. You do not have permission to view this file." });
      }

      // Build absolute path to submissions directory and stream file
      const filePath = path.join(dirs.submissions, filename);
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ message: "File not found." });
      }

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      return res.sendFile(filePath);
    } catch (err) {
      logger.error("Error serving teacher submission file:", err);
      return res.status(500).json({ message: "Server error occurred while retrieving file." });
    }
  }
);protectedRouter.get(
  "/teacher/feedback/:filename",
  hasRole("student", "teacher", "admin", "global_overseer"),
  async (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(dirs.feedback, filename);
      const userId = req.user.id;
      const userRole = req.user.role;
      await fs.access(filePath);
      let isAuthorized = false;
      if (userRole === "global_overseer" || userRole === "admin") {
        isAuthorized = true;
      } else {
        const submission = await Submission.findOne({
          feedback_file: `/uploads/feedback/${filename}`,
        });
        if (submission) {
          if (userRole === "teacher") {
            const assignment = await Assignment.findById(
              submission.assignment_id
            );
            if (assignment && assignment.created_by.toString() === userId) {
              isAuthorized = true;
            }
          } else if (
            userRole === "student" &&
            submission.user_id.toString() === userId
          ) {
            isAuthorized = true;
          }
        }
      }
      if (isAuthorized) {
        res.sendFile(filePath);
      } else {
        res
          .status(403)
          .json({
            message: "Forbidden. You do not have permission to view this file.",
          });
      }
    } catch (error) {
      logger.error("Error serving feedback file:", error);
      if (error.code === "ENOENT") {
        res.status(404).json({ message: "File not found." });
      } else {
        res
          .status(500)
          .json({ message: "Server error occurred while retrieving file." });
      }
    }
  }
);

const checkUserCountryAndRole = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("schoolCountry email occupation schoolName");

    if (!user) {
      return res.status(400).json({ error: "User not found." });
    }

    
    if (!user.schoolCountry) {
      user.schoolCountry = "GH";
    }

    const restrictedRoles = ["overseer", "global_overseer"];
    if (restrictedRoles.includes(user.occupation)) {
      return res.status(403).json({ error: "Forbidden: This role does not require this functionality." });
    }

    req.fullUser = user;
    next();
  } catch (err) {
    logger.error("Middleware error checking user country and role:", err);
    res.status(500).json({ error: "An internal server error occurred." });
  }
}

protectedRouter.get("/pricing", checkUserCountryAndRole, async (req, res) => {
  try {
    const user = req.fullUser || req.user;

    console.log("Pricing request user:", user);

    const userRole = user.occupation || user.role || "student";
    const schoolName = user.schoolName || "";
    const schoolCountry = user.schoolCountry || "GH"; 

    const price = await getUserPrice(user, userRole, schoolName, schoolCountry);

    if (!price || typeof price.ghsPrice !== "number") {
      
      const defaultPrice = 15;
      return res.json({
        ghsPrice: defaultPrice,
        usdPrice: +(defaultPrice * 0.082).toFixed(2), 
        localPrice: defaultPrice,
        currency: "GHS",
        displayPrice: defaultPrice,
        displayCurrency: "GHS",
        pricingType: "GH Base",
      });
    }

    console.log("Price computed:", price);
    res.json(price);
  } catch (err) {
    console.error("Error in /pricing route:", err);
 
    const defaultPrice = 15;
    res.json({
      ghsPrice: defaultPrice,
      usdPrice: +(defaultPrice * 0.082).toFixed(2), 
      localPrice: defaultPrice,
      currency: "GHS",
      displayPrice: defaultPrice,
      displayCurrency: "GHS",
      pricingType: "GH Base",
    });
  }
});


protectedRouter.post(
  "/payment/initiate",
  checkUserCountryAndRole,
  paymentController.initializePayment
);


protectedRouter.post("/trial/start", authenticateJWT, async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    if (user.is_on_trial || user.has_used_trial) {
      return res.status(400).json({ error: "Trial has already been used or is currently active." });
    }

    const now = new Date();
    const trialDurationDays = 30;
    const trialEndsAt = new Date(now.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);

    user.is_on_trial = true;
    user.trial_starts_at = now;
    user.trial_end_at = trialEndsAt;

    await user.save();

    agenda.schedule(`${trialDurationDays} days`, "end-trial", { userId: user._id });

    logger.info(`Free trial started for user ${userId}. Ends at ${trialEndsAt.toISOString()}`);

    res.json({
      message: `Free trial started successfully. It will end on ${trialEndsAt.toISOString()}`,
      trial_ends_at: trialEndsAt,
    });
  } catch (err) {
    logger.error("Error starting free trial:", err);
    res.status(500).json({ error: "Failed to start free trial." });
  }
});


protectedRouter.get("/user/status", authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    res.json({
      is_on_trial: user.is_on_trial,
      subscription_active: user.subscription_active || false,
      trial_ends_at: user.trial_ends_at || null,
    });
  } catch (err) {
    logger.error("Error fetching user status:", err);
    res.status(500).json({ error: "Failed to fetch user status." });
  }
});


protectedRouter.use("/advanced-goals", advancedGoalsRouter);
protectedRouter.use("/budget", budgetRouter);
protectedRouter.use("/essay", essayRouter);
protectedRouter.use("/schools", schoolRouter);
protectedRouter.use("/uploads", uploadRouter);
protectedRouter.use("/worker", workerRouter);
protectedRouter.use("/special-links", specialLinksHandler);

export default protectedRouter;
