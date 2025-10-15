import { connectDB } from "../../../lib/db.js";
import models from "../../../models/index.js";
import { authenticateJWT } from "../../../middlewares/auth.js";
import { hasRole } from "../../../middlewares/roles.js";
import logger from "../../../utils/logger.js";
import eventBus from "../../../utils/eventBus.js";

export default async function handler(req, res) {
  await connectDB();
  const { StudentTask } = models;

  const authResult = await authenticateJWT(req, res);
  if (!authResult?.user) return;

  const roleCheck = hasRole("student")(req, res);
  if (!roleCheck) return;

  try {
    if (req.method === "POST") {
      const { title, description, due_date } = req.body;

      if (!title || !due_date) {
        return res.status(400).json({ message: "Title and due_date are required." });
      }

      const dueDate = new Date(due_date);
      if (isNaN(dueDate.getTime())) {
        return res.status(400).json({ message: "Invalid due_date." });
      }

      const newTask = new StudentTask({
        student_id: req.user.id,
        title,
        description: description || "",
        due_date: dueDate,
      });

      const savedTask = await newTask.save();

      eventBus.emit("task_created", {
        taskId: savedTask._id,
        studentId: req.user.id,
        title: savedTask.title,
      });

      return res.status(201).json({ message: "Task created successfully", task: savedTask });
    }

    if (req.method === "GET") {
      const tasks = await StudentTask.find({ student_id: req.user.id }).sort({ due_date: 1 });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(tasks);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error) {
    logger.error("Error handling student tasks:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
}
