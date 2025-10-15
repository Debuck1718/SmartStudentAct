import { connectDB } from "../../../../lib/db.js";
import models from "../../../../models/index.js";
import { authenticateJWT } from "../../../../middlewares/auth.js";
import { hasRole } from "../../../../middlewares/roles.js";
import eventBus from "../../../../utils/eventBus.js";
import logger from "../../../../utils/logger.js";

export default async function handler(req, res) {
  await connectDB();

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const authResult = await authenticateJWT(req, res);
    if (!authResult?.user) return;

    const roleCheck = hasRole("student")(req, res);
    if (!roleCheck) return;

    const { quizId } = req.query;
    const { answers, finalize, autoSubmit } = req.body;

    const { User, Quiz } = models;
    const student = await User.findById(req.user.id);
    if (!student) return res.status(404).json({ message: "Student not found." });

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found." });

    const allowed =
      quiz.assigned_to_users.includes(student.email) ||
      quiz.assigned_to_grades.includes(student.grade) ||
      quiz.assigned_to_schools.includes(student.schoolName);

    if (!allowed) {
      return res.status(403).json({ message: "Not authorized for this quiz." });
    }

    let submission = quiz.submissions.find(
      (sub) => String(sub.student_id) === String(student._id)
    );

    if (!submission) {
      submission = {
        student_id: student._id,
        answers: [],
        score: 0,
        started_at: new Date(),
        submitted_at: null,
        auto_submitted: false,
      };
      quiz.submissions.push(submission);
    }

    submission.answers = answers;

    if (finalize || (quiz.timeLimitMinutes && autoSubmit)) {
      let score = 0;
      quiz.questions.forEach((q, idx) => {
        if (answers[idx] === q.correct) score++;
      });
      submission.score = score;
      submission.submitted_at = new Date();
      submission.auto_submitted = !!autoSubmit;
    }

    await quiz.save();

    eventBus.emit("quiz_submitted", {
      quizId,
      studentId: student._id,
      score: submission.score,
    });

    res.status(201).json({
      message: finalize ? "Quiz submitted successfully!" : "Answers auto-saved.",
      score: submission.score,
      total: quiz.questions.length,
      submission,
      quiz,
    });
  } catch (error) {
    logger.error("Error submitting quiz:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}
