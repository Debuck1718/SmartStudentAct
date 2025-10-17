import mongoose from "mongoose";
import { connectDB } from "../../lib/db.js";
import models from "../../models/index.js";
import { authenticateJWT } from "../../middlewares/auth.js";
import { hasRole } from "../../middlewares/roles.js";
import logger from "../../../Frontend/utils/logger.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  try {
    await connectDB();

    // ✅ Authenticate
    const auth = await authenticateJWT(req, res);
    if (!auth?.user) return;
    const user = auth.user;

    // ✅ Role Check
    const roleCheck = hasRole("student")(req, res, user);
    if (roleCheck !== true) return;

    const { User, Assignment } = models;
    const student = await User.findById(user._id).populate("school");
    if (!student) return res.status(404).json({ message: "Student not found." });

    const studentIdObj = new mongoose.Types.ObjectId(student._id);
    const conditions = [{ assigned_to_users: { $in: [studentIdObj, student.email] } }];

    if (student.program) conditions.push({ assigned_to_programs: { $in: [student.program] } });
    if (student.school?._id) conditions.push({ assigned_to_schools: { $in: [student.school._id] } });
    if (student.educationLevel === "university" && student.uniLevel)
      conditions.push({ assigned_to_levels: { $in: [student.uniLevel] } });
    else if (student.grade) {
      conditions.push({ assigned_to_grades: { $in: [student.grade] } });
      conditions.push({ assigned_to_other_grades: { $in: [student.grade] } });
    }

    const assignments = await Assignment.find({ $or: conditions }).sort({ due_date: 1 });
    res.status(200).json(assignments);
  } catch (error) {
    logger.error("Error fetching student assignments:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}
