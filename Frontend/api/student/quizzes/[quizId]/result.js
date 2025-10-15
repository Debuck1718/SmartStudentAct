import { connectDB } from "../../../../lib/db.js";
import models from "../../../../models/index.js";
import { authenticateJWT } from "../../../../middlewares/auth.js";
import { hasRole } from "../../../../middlewares/roles.js";
import logger from "../../../../utils/logger.js";

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

    const { quizId } = req.query;
    const { Quiz, User } = models;

    const student = await User.findById(req.user.id);
    if (!student) return res.status(404).json({ message: "Student not found." });

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    const submission = quiz.submissions.find(
      (sub) => String(sub.student_id) === String(student._id)
    );

    if (!submission) {
      return res.status(404).json({ message: "You haven’t submitted this quiz yet." });
    }

    const totalQuestions = quiz.questions.length;
    const correctAnswers = quiz.questions.map((q) => q.correct);
    const studentAnswers = submission.answers || [];
    const detailedResults = quiz.questions.map((q, i) => ({
      question: q.question,
      options: q.options,
      correctAnswer: q.correct,
      studentAnswer: studentAnswers[i],
      isCorrect: studentAnswers[i] === q.correct,
    }));

    res.status(200).json({
      quizTitle: quiz.title,
      score: submission.score,
      totalQuestions,
      percentage: ((submission.score / totalQuestions) * 100).toFixed(2),
      submittedAt: submission.submitted_at,
      detailedResults,
    });
  } catch (error) {
    logger.error("Error fetching quiz result:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}
