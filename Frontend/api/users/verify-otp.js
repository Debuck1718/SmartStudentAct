import jwt from "jsonwebtoken";
import { connectDb } from "@/utils/connectDb";
import User from "@/models/User";
import School from "@/models/School";
import logger from "@/utils/logger";
import {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} from "@/api/middlewares/auth";
import { sendWelcomeEmail } from "@/utils/email";
import { getRedirectUrl } from "@/utils/helpers";

const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  await connectDb();

  try {
    const { code, email, password, otpToken } = req.body;
    const decoded = jwt.verify(otpToken, JWT_SECRET);

    if (decoded.email !== email || decoded.code !== code)
      return res.status(400).json({ message: "Invalid email or OTP." });

    let user = await User.findOne({ email }).select("+password");
    if (!user) {
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
        firstname: decoded.firstname,
        lastname: decoded.lastname,
        email: decoded.email,
        phone: decoded.phone,
        password,
        verified: true,
        role: decoded.occupation,
        occupation: decoded.occupation,
        school: school._id,
        is_on_trial: true,
        trial_start_at: now,
        trial_end_at: trialEndAt,
        subscription_status: "inactive",
        program: decoded.program,
        teacherGrade: decoded.teacherGrade,
        teacherSubject: decoded.teacherSubject,
        educationLevel: decoded.educationLevel,
        grade: decoded.grade ? Number(decoded.grade) : undefined,
      });
      await user.save();
      sendWelcomeEmail(user.email, user.firstname).catch(logger.error);
    } else if (!user.password) {
      user.password = password;
      await user.save();
    }

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
    if (err.name === "TokenExpiredError")
      return res.status(400).json({ message: "OTP expired." });
    return res.status(500).json({ message: "OTP verification failed." });
  }
}
