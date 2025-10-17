// /api/public/logout.js
import { connectDb } from "@/utils/connectDb";
import User from "@/models/User";
import { clearAuthCookies } from "@/middlewares/auth";
import logger from "@/utils/logger";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDb();

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    await User.updateOne({ email }, { $unset: { refreshToken: 1 } });

    clearAuthCookies(res);

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    logger.error("❌ Logout error:", err);
    res.status(500).json({ message: "Logout failed" });
  }
}
