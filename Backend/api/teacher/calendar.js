// /api/teacher/calendar.js
import { connectDb } from "../../../Frontend/utils/connectDb";
import { withMiddleware } from "../../../Frontend/utils/withMiddleware";
import { authenticateJWT, hasRole } from "../../../Frontend/api/middlewares/auth";
import User from "../../../Frontend/api/models/User";
import SchoolCalendar from "../../../Frontend/api/models/SchoolCalendar";

async function handler(req, res) {
  await connectDb();

  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const { academicYear, terms } = req.body;
  const teacherId = req.user.id;

  if (!academicYear || !Array.isArray(terms) || terms.length === 0) {
    return res.status(400).json({ message: "Academic year and at least one term are required." });
  }

  const teacher = await User.findById(teacherId).populate("school");
  if (!teacher || !teacher.school) return res.status(400).json({ message: "Teacher school not found." });

  const formattedTerms = terms.map((term, idx) => {
    const termName = term.termName?.trim() || term.name?.trim();
    const startDate = term.startDate || term.date;
    const endDate = term.endDate || term.date;
    if (!termName || !startDate || !endDate) throw new Error(`Term ${idx + 1} is missing required fields.`);
    return { termName, startDate: new Date(startDate), endDate: new Date(endDate) };
  });

  let schoolCalendar = await SchoolCalendar.findOne({ school: teacher.school._id, academicYear });

  if (schoolCalendar) {
    schoolCalendar.teacher_id = teacherId;
    schoolCalendar.terms = formattedTerms;
    await schoolCalendar.save();
    return res.status(200).json({ message: "Academic calendar updated successfully", calendar: schoolCalendar });
  }

  schoolCalendar = new SchoolCalendar({
    teacher_id: teacherId,
    school: teacher.school._id,
    schoolName: teacher.school.name,
    academicYear,
    terms: formattedTerms,
  });

  await schoolCalendar.save();
  return res.status(201).json({ message: "Academic calendar submitted successfully", calendar: schoolCalendar });
}

export default withMiddleware(handler, [authenticateJWT, (req, res, next) => hasRole(["teacher"])(req, res, next)]);
