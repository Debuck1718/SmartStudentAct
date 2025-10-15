import Joi from "joi";

// ✅ Common fields shared by most users
const baseUserSchema = {
  firstname: Joi.string().min(2).max(50).required().messages({
    "string.empty": "First name is required.",
  }),
  lastname: Joi.string().min(2).max(50).required().messages({
    "string.empty": "Last name is required.",
  }),
  email: Joi.string().email().required().messages({
    "string.email": "Invalid email format.",
  }),
  phone: Joi.string().min(7).max(20).allow("", null),
  occupation: Joi.string()
    .valid("student", "teacher", "admin", "worker")
    .required()
    .messages({
      "any.only": "Occupation must be one of student, teacher, admin, or worker.",
    }),
};

// ✅ For school-based users (student, teacher, admin)
const schoolSchema = Joi.object({
  schoolName: Joi.string().min(2).max(100).required(),
  schoolCountry: Joi.string().min(2).max(100).required(),
});

// ✅ Student schema
export const studentSchema = Joi.object({
  ...baseUserSchema,
  educationLevel: Joi.string().valid("primary", "secondary", "university").required(),
  grade: Joi.string().allow("", null),
  university: Joi.string().allow("", null),
  uniLevel: Joi.string().allow("", null),
  program: Joi.string().allow("", null),
  school: schoolSchema.required(),
});

// ✅ Teacher schema
export const teacherSchema = Joi.object({
  ...baseUserSchema,
  teacherGrade: Joi.string().required(),
  teacherSubject: Joi.string().required(),
  school: schoolSchema.required(),
});

// ✅ Admin schema (school admin / overseer)
export const adminSchema = Joi.object({
  ...baseUserSchema,
  school: schoolSchema.required(),
});

// ✅ Worker schema (independent users)
export const workerSchema = Joi.object({
  ...baseUserSchema,
  country: Joi.string().min(2).max(100).required().messages({
    "string.empty": "Country is required for workers.",
  }),
});

// ✅ General settings update schema (for all user types)
export const settingsSchema = Joi.object({
  theme: Joi.string().valid("light", "dark").default("light"),
  language: Joi.string().valid("en", "fr", "es", "tr", "ar", "ru").default("en"),
  notificationsEnabled: Joi.boolean().default(true),
});

// ✅ Profile update schema (for PATCH /api/profile/update)
export const profileUpdateSchema = Joi.object({
  firstname: Joi.string().min(2).max(50),
  lastname: Joi.string().min(2).max(50),
  email: Joi.string().email(),
  phone: Joi.string().min(7).max(20).allow("", null),
  occupation: Joi.string().valid("student", "teacher", "admin", "worker"),
  educationLevel: Joi.string().allow("", null),
  grade: Joi.string().allow("", null),
  university: Joi.string().allow("", null),
  uniLevel: Joi.string().allow("", null),
  program: Joi.string().allow("", null),
  teacherGrade: Joi.string().allow("", null),
  teacherSubject: Joi.string().allow("", null),
  country: Joi.string().allow("", null),
  school: schoolSchema.allow(null),
}).min(1);
