import rateLimit from "express-rate-limit";
import Joi from "joi";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { connectDb } from "@/api/_utils/connectDb";
import { sendOTPEmail } from "@/api/_utils/email";
import User from "@/models/User";
import logger from "@/api/_utils/logger";
import { getGenericRedirect } from "@/api/_utils/helpers";

const JWT_SECRET = process.env.JWT_SECRET;

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
  educationLevel: Joi.string().allow(""),
  grade: Joi.string().allow(""),
  program: Joi.string().allow(""),
  teacherGrade: Joi.string().allow(""),
  teacherSubject: Joi.string().allow(""),
});

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  try {
    await connectDb();

    const { error, value } = signupOtpSchema.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({ message: "Validation failed", errors: error.details });

    const payload = {
      ...value,
      temporaryUserId: crypto.randomUUID(),
      code: Math.floor(100000 + Math.random() * 900000).toString(),
    };

    const existingUser = await User.findOne({ email: payload.email });
    const otpToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "10m" });

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
