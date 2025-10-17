import { connectDB } from "../../lib/db.js";
import models from "../../models/index.js";
import { authenticateJWT } from "../../middlewares/auth.js";
import { hasRole } from "../../middlewares/roles.js";
import logger from "../../../Frontend/utils/logger.js";

export default async function handler(req, res) {
  if (req.method !== "PATCH")
    return res.status(405).json({ message: "Method not allowed" });

  await connectDB();

  const { StudentTask } = models;
  const auth = await authenticateJWT(req, res);
  if (!auth?.user) return;
  const user = auth.user;

  const roleCheck = hasRole("student")(req, res, user);
  if (roleCheck !== true) return;

  try {
    const { id } = req.query;
    const task = await StudentTask.findOneAndUpdate(
      { _id: id, student_id: user._id },
      { is_completed: true },
      { new: true }
    );

    if (!task) return res.status(404).json({ message: "Task not found." });
    res.status(200).json({ message: "Task marked as completed", task });
  } catch (error) {
    logger.error("Error marking task complete:", error);
    res.status(500).json({ message: "Server error" });
  }
}
