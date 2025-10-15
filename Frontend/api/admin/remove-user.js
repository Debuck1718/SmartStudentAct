import { connectDb } from "../../utils/connectDb";
import { authenticateJWT } from "../../middlewares/auth";
import User from "../../models/User";

export default async function handler(req, res) {
  await connectDb();
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const actor = await authenticateJWT(req);
  if (!actor || !["admin", "overseer", "global_overseer"].includes(actor.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email required" });
  if (actor.email === email) return res.status(403).json({ message: "Cannot remove your own account." });

  try {
    const targetUser = await User.findOne({ email });
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    if (
      (actor.role === "overseer" && ["overseer", "global_overseer"].includes(targetUser.role)) ||
      (actor.role === "admin" &&
        (["admin", "overseer", "global_overseer"].includes(targetUser.role) ||
          (actor.schoolName !== targetUser.schoolName && actor.teacherSchool !== targetUser.teacherSchool)))
    ) {
      return res.status(403).json({ message: "You do not have permission to remove this user." });
    }

    const result = await User.deleteOne({ email });
    if (!result.deletedCount) return res.status(404).json({ message: "User not found or not authorized." });

    res.json({ message: "User removed successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to remove user." });
  }
}
