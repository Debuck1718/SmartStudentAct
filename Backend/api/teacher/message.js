import { connectDb } from "../../../Frontend/utils/connectDb";
import { withMiddleware } from "../../../Frontend/utils/withMiddleware";
import { authenticateJWT, hasRole } from "../../middlewares/auth";
import User from "../../models/User";
import Message from "../../models/Message";

async function handler(req, res) {
  await connectDb();
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const { assigned_to_users = [], assigned_to_grades = [], message } = req.body;
  let studentIds = [];

  if (assigned_to_users.length > 0) {
    const students = await User.find({ _id: { $in: assigned_to_users }, role: "student" });
    studentIds.push(...students.map((s) => s._id));
  }

  if (assigned_to_grades.length > 0) {
    const gradeStudents = await User.find({ grade: { $in: assigned_to_grades }, role: "student" });
    studentIds.push(...gradeStudents.map((s) => s._id));
  }

  studentIds = [...new Set(studentIds.map((id) => id.toString()))];
  if (studentIds.length === 0) return res.status(400).json({ message: "No students selected." });

  const savedMessages = [];
  for (const id of studentIds) {
    const msg = new Message({ teacherName: req.user.firstname, studentId: id, text: message });
    await msg.save();
    savedMessages.push(msg);
  }

  return res.status(200).json({ message: "Message sent successfully!", studentIds, savedMessages });
}

export default withMiddleware(handler, [authenticateJWT, (req, res, next) => hasRole(["teacher"])(req, res, next)]);
