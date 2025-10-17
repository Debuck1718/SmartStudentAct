// /api/public/forgot-password.js
import jwt from "jsonwebtoken";
import { connectDb } from "@/utils/connectDb";
import User from "@/models/User";
import { sendPasswordResetEmail } from "@/utils/email";
import logger from "@/utils/logger";
import { getGenericRedirect } from "@/utils/helpers";

const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDb();
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found" });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "15m" });
    const resetLink = `${process.env.FRONTEND_URL}${getGenericRedirect(req, "resetPassword")}?token=${token}`;

    await sendPasswordResetEmail(user.email, user.firstname, resetLink);

    return res.status(200).json({
      status: "success",
      message: "Password reset link sent successfully",
      resetLink, // helpful for mobile app redirection
    });
  } catch (err) {
    logger.error("❌ Forgot Password error:", err);
    res.status(500).json({ message: "Failed to process password reset request." });
  }
}
