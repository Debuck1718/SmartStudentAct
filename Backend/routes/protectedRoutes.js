const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const crypto = require("crypto");
const Joi = require("joi");
const logger = require("../utils/logger");
const webpush = require("web-push");
const jwt = require("jsonwebtoken");
const eventBus = require("../utils/eventBus");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { authenticateJWT } = require("../middlewares/auth");
const checkSubscription = require("../middlewares/checkSubscription");

const User = require("../models/User");
const Goal = require("../models/Goal");
const Budget = require("../models/Budget");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const PushSub = require("../models/PushSub");
const School = require("../models/School");
const Quiz = require("../models/Quiz");
const StudentTask = require("../models/StudentTask"); 
const SchoolCalendar = require("../models/SchoolCalendar");

const advancedGoalsRouter = require("./advancedGoals");
const essayRouter = require("./essay");
const budgetRouter = require("./budget");
const schoolRouter = require("./schoolRoutes");
const uploadRouter = require("./uploadRoutes");

const paymentController = require("../controllers/paymentController");
const { getUserPrice } = require('../services/pricingService');

const mongoose = require('mongoose');

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
const agenda = { schedule: () => {} };

const protectedRouter = express.Router();

const hasRole = (allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      status: false,
      message: "Sorry, you are not authorized to view this resource.",
    });
  }
  next();
};

protectedRouter.use(authenticateJWT, checkSubscription);

const localDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    let dest;
    if (req.path.includes("/teacher/assignments")) {
      dest = path.join(__dirname, "uploads", "assignments");
    } else if (req.path.includes("/student/submissions")) {
      dest = path.join(__dirname, "uploads", "submissions");
    } else {
      dest = path.join(__dirname, "uploads", "other");
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

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: require("cloudinary").v2,
  params: {
    folder: "smartstudent-uploads",
    allowed_formats: ["jpg", "png", "jpeg", "webp", "gif"],
    transformation: [{ width: 800, crop: "scale" }],
  },
});

const profilePictureStorage = new CloudinaryStorage({
  cloudinary: require("cloudinary").v2,
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

const dirs = {
  assignments: path.join(__dirname, "uploads", "assignments"),
  submissions: path.join(__dirname, "uploads", "submissions"),
  feedback: path.join(__dirname, "uploads", "feedback"),
  other: path.join(__dirname, "uploads", "other"),
};
Object.values(dirs).forEach(async (d) => {
  try {
    await fs.mkdir(d, { recursive: true });
    logger.info(`Ensured upload directory exists: ${d}`);
  } catch (error) {
    logger.error(`Failed to create upload directory ${d}: ${error.message}`);
  }
});

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

  // University levels (100, 200, 300, 400)
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
  name: Joi.string().min(2).required(),
  country: Joi.string().length(2).uppercase().required(),
  tier: Joi.number().integer().min(1).required(),
});

const assignRegionSchema = Joi.object({
  overseerEmail: Joi.string().email().required(),
  region: Joi.string().required(),
});

const academicCalendarSchema = Joi.object({
  schoolName: Joi.string().required(),
  academicYear: Joi.string().required(),
  terms: Joi.array()
    .items(
      Joi.object({
        termName: Joi.string().required(),
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().required(),
      })
    )
    .min(1)
    .required(),
});

const settingsSchema = Joi.object({
  firstname: Joi.string().min(2).max(50).optional(),
  lastname: Joi.string().min(2).max(50).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string()
    .pattern(/^\+?[0-9]{7,15}$/)
    .optional(),

  occupation: Joi.string().valid("student", "teacher").required(),

  schoolName: Joi.string().max(100).required(),
  schoolCountry: Joi.string().max(100).required(),

  
  educationLevel: Joi.string()
    .valid("junior", "high", "university")
    .when("occupation", {
      is: "student",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),

  grade: Joi.number().integer().min(1).max(12).when("educationLevel", {
    is: Joi.valid("junior", "high"),
    then: Joi.required(),
    otherwise: Joi.forbidden(), 
  }),

  university: Joi.string().max(150).when("educationLevel", {
    is: "university",
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),

  uniLevel: Joi.string()
    .valid("100", "200", "300", "400")
    .when("educationLevel", {
      is: "university",
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),

  program: Joi.string().max(100).optional(),

  // Teachers
  teacherGrade: Joi.array()
    .items(Joi.string())
    .when("occupation", {
      is: "teacher",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),

  teacherSubject: Joi.string()
    .max(100)
    .when("occupation", {
      is: "teacher",
      then: Joi.required(),
      otherwise: Joi.optional(),
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
  const userId = req.userId;
  try {
    const user = await User.findById(userId)
      .select(
        "firstname lastname email phone occupation educationLevel grade university uniLevel program teacherGrade teacherSubject profile_picture_url school"
      )
      .populate("school", "name schoolCountry");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json(user);
  } catch (error) {
    logger.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});



protectedRouter.patch(
  "/profile",
  authenticateJWT,
  validate(settingsSchema),
  async (req, res) => {
    const userId = req.userId || req.body.userId;
    let updateData = req.body;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Authentication failed. User ID not found." });
    }

    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      // 1. Conditionally filter the updateData based on the user's occupation.
      // This prevents saving of forbidden fields.
      const currentOccupation = updateData.occupation || user.occupation;

      if (currentOccupation === "student") {
        updateData = {
          ...updateData,
          teacherGrade: undefined,
          teacherSubject: undefined,
        };
      } else if (currentOccupation === "teacher") {
        updateData = {
          ...updateData,
          educationLevel: undefined,
          grade: undefined,
          university: undefined,
          uniLevel: undefined,
          program: undefined,
        };
      }

      // 2. Check for email uniqueness if the email is being updated.
      if (updateData.email && updateData.email !== user.email) {
        const existingUser = await User.findOne({ email: updateData.email });
        if (existingUser) {
          return res.status(409).json({ message: "Email already in use." });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
        runValidators: true,
      }).select(
        "firstname lastname email phone occupation schoolName schoolCountry educationLevel grade university uniLevel program teacherGrade teacherSubject profile_picture_url"
      );

      if (!updatedUser) {
        logger.warn(`User with ID ${userId} not found during profile update.`);
        return res.status(404).json({ message: "User not found." });
      }

      res.status(200).json({
        message: "Profile updated successfully.",
        user: {
          firstname: updatedUser.firstname,
          lastname: updatedUser.lastname,
          email: updatedUser.email,
          phone: updatedUser.phone,
          occupation: updatedUser.occupation,
          schoolName: updatedUser.schoolName,
          schoolCountry: updatedUser.schoolCountry,
          educationLevel: updatedUser.educationLevel,
          grade: updatedUser.grade,
          university: updatedUser.university,
          uniLevel: updatedUser.uniLevel,
          program: updatedUser.program,
          teacherGrade: updatedUser.teacherGrade,
          teacherSubject: updatedUser.teacherSubject,
          profile_picture_url: updatedUser.profile_picture_url,
        },
      });
    } catch (error) {
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((val) => val.message);
        return res
          .status(400)
          .json({ message: "Validation failed", errors: messages });
      }
      if (error.code === 11000) {
        return res
          .status(409)
          .json({ message: "A user with this data already exists." });
      }
      logger.error("Error updating user profile:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);


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
      const photoUrl = req.file.path;

      const result = await User.updateOne(
        { _id: userId },
        { $set: { profile_picture_url: photoUrl } }
      );

      if (result.modifiedCount > 0) {
        res.status(200).json({
          message: "Profile picture updated successfully.",
          photoUrl: photoUrl,
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

protectedRouter.post(
  "/admin/schools/add",
  authenticateJWT,
  hasRole(["overseer", "global_overseer"]),
  validate(schoolSchema),
  async (req, res) => {
    const { name, country, tier } = req.body;
    try {
      const newSchool = new School({ name, country, tier });
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
      const teacher = await User.findById(req.user.id).select("-password");
      if (!teacher) {
        return res.status(404).json({ message: "Teacher profile not found." });
      }
      res.status(200).json(teacher);
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
    const teacherId = req.user.id;

    try {
      const teacher = await User.findById(teacherId).populate("school");
      if (!teacher || !teacher.school) {
        return res.status(400).json({ message: "Teacher school not found." });
      }

      const school = teacher.school; 

      let schoolCalendar = await SchoolCalendar.findOne({
        school: school._id,
        academicYear,
      });

      if (schoolCalendar) {
        schoolCalendar.teacher_id = teacherId;
        schoolCalendar.terms = terms;
        await schoolCalendar.save();
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
        terms,
      });
      await schoolCalendar.save();

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
      const teacherId = req.user.id;
      const { title, description, due_date, assigned_to_users, assigned_to_grades, assigned_to_levels, assigned_to_programs, assigned_to_schools } = req.body;

      const newAssignment = new Assignment({
        teacher_id: teacherId,
        title,
        description,
        file_path: req.file ? `/uploads/assignments/${req.file.filename}` : null,
        due_date,
        assigned_to_users: assigned_to_users || [],
        assigned_to_grades: assigned_to_grades || [],
        assigned_to_levels: assigned_to_levels || [],
        assigned_to_programs: assigned_to_programs || [],
        assigned_to_schools: assigned_to_schools || [],
      });

      await newAssignment.save();
      res.status(201).json({ message: "Assignment created successfully", assignment: newAssignment });
    } catch (error) {
      logger.error("Error creating assignment:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.get(
  "/teacher/assignments",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
        return res.status(400).json({ message: "Invalid teacher ID." });
      }

      const teacherId = new mongoose.Types.ObjectId(req.user.id);
      const assignments = await Assignment.find({ teacher_id: teacherId }).sort({ createdAt: -1 });
      res.status(200).json(assignments);
    } catch (error) {
      logger.error("Error fetching assignments:", error);
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
      if (!assignment || assignment.teacher_id !== req.user.id) {
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
      const quizzes = await Quiz.find({ teacher_id: req.user.id }).sort({ createdAt: -1 });
      res.status(200).json(quizzes);
    } catch (error) {
      logger.error("Error fetching teacher quizzes:", error);
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
      const { title, description, due_date, timeLimitMinutes, questions, assigned_to_users, assigned_to_grades, assigned_to_programs, assigned_to_schools } = req.body;

      const quiz = new Quiz({
        teacher_id: req.user.id,
        title,
        description,
        due_date,
        timeLimitMinutes,
        questions,
        assigned_to_users: assigned_to_users || [],
        assigned_to_grades: assigned_to_grades || [],
        assigned_to_programs: assigned_to_programs || [],
        assigned_to_schools: assigned_to_schools || [],
      });

      await quiz.save();
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
      if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
        return res.status(400).json({ message: "Invalid teacher ID." });
      }
      
      const now = new Date();
      const teacherId = new mongoose.Types.ObjectId(req.user.id);
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
      const assignedTasks = await Assignment.find({ teacher_id: req.user.id });
      res.status(200).json(assignedTasks);
    } catch (error) {
      logger.error("Error fetching assigned tasks:", error);
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
      if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
        return res.status(400).json({ message: "Invalid teacher ID." });
      }

      const teacherId = new mongoose.Types.ObjectId(req.user.id);
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
    const { to, text } = req.body;

    try {
      const student = await User.findOne({ email: to, role: "student" });
      if (!student) {
        return res.status(404).json({ message: "Student not found." });
      }

      eventBus.emit("teacher_message", {
        userId: student._id,
        message: text,
        teacherName: req.user.firstname,
      });

      res.status(200).json({ message: "Message sent successfully!" });
    } catch (error) {
      logger.error("Error sending message:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.get(
  "/teacher/students/other",
  authenticateJWT,
  hasRole("teacher"),
  async (req, res) => {
    try {
      const teacher = await User.findById(req.user.id);
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

      const otherStudents = await User.find(schoolQuery).select("firstname lastname email grade imageUrl");
      res.status(200).json(otherStudents);
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
      const teacher = await User.findById(req.user.id);
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

      const students = await User.find(schoolQuery).select("firstname lastname email grade imageUrl");
      res.status(200).json(students || []);
    } catch (error) {
      logger.error("Error fetching students for teacher's class:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get("/auth/check", authenticateJWT, (req, res) => {
  res.json({
    status: true,
    message: "Authenticated",
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});



protectedRouter.get(
  "/student/assignments",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const student = await User.findById(req.user.id).populate("school");
      if (!student) {
        return res.status(404).json({ message: "Student not found." });
      }

      const conditions = [
        { assigned_to_users: student.email },
        { assigned_to_programs: student.program },
        { assigned_to_schools: student.school },
      ];

      if (student.educationLevel === "university") {
        conditions.push({ assigned_to_levels: student.uniLevel });
      } else {
        conditions.push({ assigned_to_grades: student.grade });
      }

      const assignments = await Assignment.find({ $or: conditions }).sort({ due_date: 1 });

      res.status(200).json(assignments);
    } catch (error) {
      logger.error("Error fetching student assignments:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


protectedRouter.post(
  "/student/tasks",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const { title, description, due_date } = req.body;

      if (!title || !due_date) {
        return res
          .status(400)
          .json({ message: "Title and due_date are required." });
      }

      const dueDate = new Date(due_date);
      if (isNaN(dueDate)) {
        return res.status(400).json({ message: "Invalid due_date" });
      }

      const newTask = new StudentTask({
        student_id: req.user.id,
        title,
        description,
        due_date: dueDate,
      });

      await newTask.save();

      req.app.locals.eventBus.emit("task_created", {
        taskId: newTask._id,
        studentId: req.user.id,
        title: newTask.title,
      });

      res
        .status(201)
        .json({ message: "Task created successfully", task: newTask });
    } catch (error) {
      logger.error("Error creating student task:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

protectedRouter.get(
  "/student/tasks",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id || req.user._id; 

      if (!studentId) {
        return res.status(400).json({ message: "Student ID missing from request." });
      }

      const tasks = await StudentTask.find({ student_id: studentId }).lean();
      return res.status(200).json(tasks);
    } catch (error) {
      logger.error("Error fetching tasks:", error.message, error.stack);
      return res.status(500).json({
        message: "Failed to fetch tasks.",
        error: error.message, 
      });
    }
  }
);


protectedRouter.patch(
  "/student/tasks/:id/complete",
  authenticateJWT,
  hasRole("student"),
  async (req, res) => {
    try {
      const task = await StudentTask.findOneAndUpdate(
        { _id: req.params.id, student_id: req.user.id },
        { is_completed: true },
        { new: true }
      );

      if (!task) return res.status(404).json({ message: "Task not found" });

      res.status(200).json({ message: "Task marked as completed", task });
    } catch (error) {
      logger.error("Error marking task complete:", error);
      res.status(500).json({ message: "Server error" });
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
          { assigned_to_users: student.email },
          { assigned_to_grades: student.grade },
          { assigned_to_schools: student.schoolName },
        ],
      });


      for (const quiz of quizzes) {
        let submission = quiz.submissions.find(
          sub => sub.student_id.toString() === student._id.toString()
        );
        if (!submission) {
          quiz.submissions.push({
            student_id: student._id,
            answers: [],
            started_at: new Date(),
          });
          await quiz.save();
        }
      }

      res.status(200).json({ quizzes });
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
        let score = 0;
        quiz.questions.forEach((q, idx) => {
          if (answers[idx] === q.correct) score++;
        });
        submission.score = score;
        submission.submitted_at = new Date();
        submission.auto_submitted = !!autoSubmit;
      }

      await quiz.save();

      eventBus.emit("quiz_submitted", {
        quizId,
        studentId: student._id,
        score: submission.score,
      });

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

      res.status(200).json({ quiz });
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
        .select("firstname lastname email teacherSubject imageUrl");

      res.status(200).json({ teachers: teachers || [] });
    } catch (err) {
      logger.error("Error fetching teachers for student:", err);
      res.status(500).json({ message: "Failed to fetch teachers" });
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
  hasRole("student", "teacher", "admin", "global_overseer"),
  async (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(dirs.assignments, filename);
      const userId = req.user.id;
      const userRole = req.user.role;
      await fs.access(filePath);
      let isAuthorized = false;
      if (userRole === "global_overseer" || userRole === "admin") {
        isAuthorized = true;
      } else {
        const assignment = await Assignment.findOne({
          attachment_file: `/uploads/assignments/${filename}`,
        });
        if (assignment) {
          if (
            userRole === "teacher" &&
            assignment.created_by.toString() === userId
          ) {
            isAuthorized = true;
          } else if (
            userRole === "student" &&
            assignment.assigned_to_users.includes(req.user.email)
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
      logger.error("Error serving assignment file:", error);
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


protectedRouter.use("/rewards", advancedGoalsRouter);
protectedRouter.use("/budget", budgetRouter);
protectedRouter.use("/essay", essayRouter);
protectedRouter.use("/schools", schoolRouter);
protectedRouter.use("/uploads", uploadRouter);

module.exports = protectedRouter;
