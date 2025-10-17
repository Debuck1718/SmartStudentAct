import { connectDb } from "../../../Frontend/utils/connectDb";
import { withMiddleware } from "../../../Frontend/utils/withMiddleware";
import { authenticateJWT, hasRole } from "../../middlewares/auth";
import User from "../../models/User";

async function handler(req, res) {
  await connectDb();
  const teacher = await User.findById(req.user.id);
  if (!teacher || !teacher.teacherGrade?.length) return res.status(200).json([]);

  const { search } = req.query;
  const schoolQuery = {
    role: "student",
    grade: { $in: teacher.teacherGrade },
  };
  if (teacher.school) schoolQuery.school = teacher.school;
  else if (teacher.schoolName) schoolQuery.schoolName = teacher.schoolName;

  if (search) {
    schoolQuery.$or = [
      { firstname: { $regex: search, $options: "i" } },
      { lastname: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const students = await User.find(schoolQuery).select("firstname lastname email grade imageUrl");
  return res.status(200).json(students || []);
}

export default withMiddleware(handler, [authenticateJWT, (req, res, next) => hasRole(["teacher"])(req, res, next)]);
