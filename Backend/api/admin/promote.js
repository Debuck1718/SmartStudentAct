import { connectDb } from "../../../Frontend/utils/connectDb";
import { authenticateJWT } from "../../middlewares/auth";
import User from "../../models/User";

export default async function handler(req, res) {
  await connectDb();

  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const user = await authenticateJWT(req);
  if (!user || !["admin", "overseer", "global_overseer"].includes(user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { email, role } = req.body;

  if (!email || !role) return res.status(400).json({ message: "Email and role are required" });
  if (email === user.email) return res.status(403).json({ message: "Cannot modify your own account." });

  try {
    const targetUser = await User.findOne({ email });
    if (!targetUser) return res.status(404).json({ message: "Target user not found" });

    // Role hierarchy checks
    if (
      (user.role === "admin" && ["overseer", "global_overseer"].includes(targetUser.role)) ||
      (user.role === "overseer" && targetUser.role === "global_overseer")
    ) {
      return res.status(403).json({ message: "You do not have permission to modify this user." });
    }

    await User.updateOne({ email }, { role });
    res.json({ message: "User updated successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update user status." });
  }
}
