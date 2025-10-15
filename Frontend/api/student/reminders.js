// /api/student/reminders.js
import { connectDB } from "../../lib/db.js";
import models from "../../models/index.js";
import { authenticateJWT } from "../../middlewares/auth.js";
import { hasRole } from "../../middlewares/roles.js";
import logger from "../../utils/logger.js";


export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  await connectDB();

  const { Reminder } = models;
  const auth = await authenticateJWT(req, res);
  if (!auth?.user) return;

  const user = auth.user;

  const roleCheck = hasRole("student")(req, res, user);
  if (roleCheck !== true) return;

  try {
    const { title, description, remind_at } =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Basic validation
    if (!title || !description)
      return res
        .status(400)
        .json({ message: "Title and description are required." });

    const reminder = new Reminder({
      student_id: user._id,
      title,
      description,
      remind_at: remind_at ? new Date(remind_at) : null,
      created_at: new Date(),
      is_sent: false,
    });

    await reminder.save();

    logger.info(`Reminder created for student: ${user._id}`);

    res.status(201).json({
      message: "Reminder created successfully.",
      reminder,
    });
  } catch (error) {
    logger.error("Error creating reminder:", error);
    res.status(500).json({ message: "Server error" });
  }
}
