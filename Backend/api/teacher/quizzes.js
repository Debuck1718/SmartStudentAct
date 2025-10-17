// /api/teacher/quizzes/index.js
import { connectDb } from "../../../Frontend/utils/connectDb";
import { withMiddleware } from "../../../Frontend/utils/withMiddleware";
import { authenticateJWT, hasRole } from "../../../Frontend/api/middlewares/auth";
import Quiz from "../../../Frontend/api/models/Quiz";
import SpecialLink from "../../../Frontend/api/models/SpecialLink";

async function handler(req, res) {
  await connectDb();

  const teacherId = req.user.id;

  if (req.method === "GET") {
    const quizzes = await Quiz.find({ teacher_id: teacherId }).sort({ createdAt: -1 });
    return res.status(200).json(quizzes);
  }

  if (req.method === "POST") {
    const {
      title,
      description,
      due_date,
      timeLimitMinutes,
      questions,
      assigned_to_users = [],
      assigned_to_grades = [],
      assigned_to_programs = [],
      assigned_to_schools = [],
      assigned_to_other_grades = [],
      specialStudentIds = [],
    } = req.body;

    let allAssignedUsers = [...assigned_to_users];

    if (specialStudentIds.length > 0) {
      const approvedSpecials = await SpecialLink.find({
        teacher_id: teacherId,
        student_id: { $in: specialStudentIds },
        status: "active",
      });
      allAssignedUsers.push(...approvedSpecials.map((s) => s.student_id));
    }

    if (
      allAssignedUsers.length === 0 &&
      assigned_to_grades.length === 0 &&
      assigned_to_programs.length === 0 &&
      assigned_to_schools.length === 0 &&
      assigned_to_other_grades.length === 0
    ) {
      return res.status(400).json({ message: "Quiz must be assigned to at least one user, grade, program, or school." });
    }

    const quiz = new Quiz({
      teacher_id: teacherId,
      title,
      description,
      due_date,
      timeLimitMinutes,
      questions,
      assigned_to_users: allAssignedUsers,
      assigned_to_grades,
      assigned_to_programs,
      assigned_to_schools,
      assigned_to_other_grades,
    });

    await quiz.save();
    return res.status(201).json({ message: "Quiz created successfully", quiz });
  }

  return res.status(405).json({ message: "Method not allowed" });
}

export default withMiddleware(handler, [authenticateJWT, (req, res, next) => hasRole(["teacher"])(req, res, next)]);
