import dbConnect from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { authenticateJWT } from "@/middlewares/auth";
import { passwordUpdateSchema } from "@/validation/schemas";

export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  try {
    await dbConnect();
    const user = await authenticateJWT(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const { currentPassword, newPassword } = req.body;
    const { error } = passwordUpdateSchema.validate({ currentPassword, newPassword });
    if (error) return res.status(400).json({ message: error.details[0].message });

    const dbUser = await User.findById(user._id).select("+password");
    if (!dbUser) return res.status(404).json({ message: "User not found." });

    const isMatch = await bcrypt.compare(currentPassword, dbUser.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid current password." });

    dbUser.password = await bcrypt.hash(newPassword, 10);
    await dbUser.save();

    res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Password update error:", err);
    res.status(500).json({ message: "Server error" });
  }
}
