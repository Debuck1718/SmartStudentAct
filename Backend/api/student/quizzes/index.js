import { connectDB } from "../../../lib/db.js";
import models from "../../../models/index.js";
import { authenticateJWT } from "../../../middlewares/auth.js";
import { hasRole } from "../../../middlewares/roles.js";
import logger from "../../../../Frontend/utils/logger.js";

export default async function handler(req, res) {
  await connectDB();

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const authResult = await authenticateJWT(req, res);
    if (!authResult?.user) return;
    const roleCheck = hasRole("student")(req, res);
    if (!roleCheck) return;

    const { User, Quiz } = models;
    const student = await User.findById(req.user.id);
    if (!student) return res.status(404).json({ message: "Student not found." });

    const quizzes = await Quiz.find({
      $or: [
        { assigned_to_users: student.email },
        { assigned_to_grades: student.grade },
        { assigned_to_schools: student.schoolName },
      ],
    });

    for (const quiz of quizzes) {
      let submission = quiz.submissions.find(
        (sub) => sub.student_id.toString() === student._id.toString()
      );
      if (!submission) {
        quiz.submissions.push({
          student_id: student._id,
          answers: [],
          started_at: new Date(),
        });
        await quiz.save();
      }
    }

    res.status(200).json({ quizzes });
  } catch (error) {
    logger.error("Error fetching student quizzes:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}
