import { connectDb } from "../../../utils/connectDb";
import { authenticateJWT } from "../../../middlewares/auth";
import Assignment from "../../../models/Assignment";
import SpecialLink from "../../../models/SpecialLink";
import formidable from "formidable";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: false, // Disable body parser for file uploads
  },
};

export default async function handler(req, res) {
  await connectDb();
  const user = await authenticateJWT(req);

  if (!user || user.role !== "teacher")
    return res.status(403).json({ message: "Forbidden" });

  // === GET ASSIGNMENTS ===
  if (req.method === "GET") {
    try {
      const assignments = await Assignment.find({ teacher_id: user._id })
        .populate("assigned_to_users", "firstname lastname email")
        .sort({ createdAt: -1 });

      return res.status(200).json(assignments);
    } catch (err) {
      return res.status(500).json({ message: "Error fetching assignments", error: err.message });
    }
  }

  // === CREATE ASSIGNMENT ===
  if (req.method === "POST") {
    const form = formidable({ multiples: false });

    form.parse(req, async (err, fields, files) => {
      if (err)
        return res.status(500).json({ message: "Error parsing form data", error: err.message });

      try {
        const {
          title,
          description,
          due_date,
          assigned_to_users = [],
          assigned_to_grades = [],
          assigned_to_programs = [],
          assigned_to_schools = [],
          assigned_to_other_grades = [],
          specialStudentIds = [],
        } = fields;

        if (!title || !description)
          return res.status(400).json({ message: "Title and description are required." });

        // Normalize all inputs into arrays
        const normalize = (val) =>
          Array.isArray(val) ? val : [val].filter(Boolean);

        let allAssignedUsers = normalize(assigned_to_users);
        const grades = normalize(assigned_to_grades);
        const programs = normalize(assigned_to_programs);
        const schools = normalize(assigned_to_schools);
        const otherGrades = normalize(assigned_to_other_grades);
        const specialIds = normalize(specialStudentIds);

        // 🟢 Fetch approved special link students if provided
        if (specialIds.length > 0) {
          const approvedSpecials = await SpecialLink.find({
            teacher_id: user._id,
            student_id: { $in: specialIds },
            status: "active",
          }).populate("student_id", "_id email firstname lastname");

          if (approvedSpecials.length === 0)
            return res.status(400).json({ message: "No valid special students found." });

          const approvedStudentIds = approvedSpecials.map((s) => s.student_id._id.toString());
          allAssignedUsers.push(...approvedStudentIds);
        }

        // Validate assignment has some target
        if (
          allAssignedUsers.length === 0 &&
          grades.length === 0 &&
          programs.length === 0 &&
          schools.length === 0 &&
          otherGrades.length === 0
        ) {
          return res
            .status(400)
            .json({ message: "Must assign to at least one user, grade, program, or school" });
        }

        // 🗂️ Handle file upload
        let file_path = null;
        if (files.file) {
          const uploadDir = path.join(process.cwd(), "public/uploads/assignments");
          if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

          const fileName = `${Date.now()}-${files.file.originalFilename}`;
          const destPath = path.join(uploadDir, fileName);

          fs.copyFileSync(files.file.filepath, destPath);
          file_path = `/uploads/assignments/${fileName}`;
        }

        // 📝 Create assignment record
        const newAssignment = new Assignment({
          teacher_id: user._id,
          title,
          description,
          due_date,
          file_path,
          assigned_to_users: allAssignedUsers,
          assigned_to_grades: grades,
          assigned_to_programs: programs,
          assigned_to_schools: schools,
          assigned_to_other_grades: otherGrades,
        });

        await newAssignment.save();

        return res.status(201).json({
          message: "Assignment created successfully.",
          assignment: newAssignment,
        });
      } catch (error) {
        return res.status(500).json({
          message: "Error creating assignment.",
          error: error.message,
        });
      }
    });
    return;
  }

  // === INVALID METHOD ===
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ message: `Method ${req.method} not allowed` });
}
