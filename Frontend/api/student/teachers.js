import { connectDB } from "../../../lib/db.js";
import models from "../../../models/index.js";
import { authenticateJWT } from "../../../middlewares/auth.js";
import { hasRole } from "../../../middlewares/roles.js";
import logger from "../../../utils/logger.js";

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

    const { User } = models;
    const student = await User.findById(req.user.id);

    if (!student || (!student.school && !student.schoolName)) {
      return res.status(200).json([]);
    }

    const { search } = req.query;
    const schoolQuery = { role: "teacher" };

    if (student.school) {
      schoolQuery.school = student.school;
    } else if (student.schoolName) {
      schoolQuery.schoolName = student.schoolName;
    }

    if (search) {
      schoolQuery.$or = [
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { teacherSubject: { $regex: search, $options: "i" } },
      ];
    }

    const teachers = await User.find(schoolQuery).select(
      "firstname lastname email teacherSubject imageUrl"
    );

    res.status(200).json({ teachers });
  } catch (error) {
    logger.error("Error fetching teachers for student:", error);
    res.status(500).json({ message: "Failed to fetch teachers" });
  }
}
