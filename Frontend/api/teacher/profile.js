// /api/teacher/profile.js
import { connectDb } from "../../utils/connectDb";
import { authenticateJWT } from "../middlewares/auth";
import User from "../../models/User";

export default async function handler(req, res) {
  await connectDb();

  const user = await authenticateJWT(req);
  if (!user || user.role !== "teacher") return res.status(403).json({ message: "Forbidden" });

  if (req.method === "GET") {
    const teacher = await User.findById(user._id).select("-password");
    if (!teacher) return res.status(404).json({ message: "Teacher profile not found." });
    return res.status(200).json(teacher);
  }

  res.status(405).json({ message: "Method not allowed" });
}
