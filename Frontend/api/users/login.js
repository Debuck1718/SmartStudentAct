// /api/public/login.js
import bcrypt from "bcryptjs";
import { connectDb } from "@/utils/connectDb";
import { generateAccessToken, generateRefreshToken, setAuthCookies } from "@/api/_middlewares/auth";
import { getRedirectUrl } from "@/utils/helpers";
import User from "@/models/User";
import logger from "@/utils/logger";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDb();
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email }).select("+password +refreshToken");

    if (!user)
      return res.status(401).json({ message: "Invalid credentials" });

    if (!user.password)
      return res.status(400).json({ message: "User must set a password first" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: "Invalid credentials" });

    // Check if account is suspended or expired trial
    const now = new Date();
    if (user.trial_end_at && now > user.trial_end_at && user.subscription_status === "inactive") {
      return res.status(403).json({
        message: "Your trial period has expired. Please subscribe to continue.",
        redirectUrl: "/payment"
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      status: "success",
      message: "Login successful",
      redirectUrl: getRedirectUrl(user, true, req),
      user: {
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    logger.error("❌ Login error:", err);
    res.status(500).json({ message: "Login failed. Please try again later." });
  }
}
