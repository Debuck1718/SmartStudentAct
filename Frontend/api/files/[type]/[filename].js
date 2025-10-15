// /api/files/[type]/[filename].js
import { connectDb } from "../../../utils/connectDb";
import { authenticateJWT } from "../../../middlewares/auth";
import Assignment from "../../../models/Assignment";
import Submission from "../../../models/Submission";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  await connectDb();
  const user = await authenticateJWT(req);
  if (!user) return res.status(403).json({ message: "Forbidden" });

  const { type, filename } = req.query;
  const baseDir = path.join(process.cwd(), "public", "uploads");

  let filePath;
  switch (type) {
    case "assignments":
      filePath = path.join(baseDir, "assignments", filename);
      break;
    case "submissions":
      filePath = path.join(baseDir, "submissions", filename);
      break;
    case "feedback":
      filePath = path.join(baseDir, "feedback", filename);
      break;
    default:
      return res.status(400).json({ message: "Invalid file type" });
  }

  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });

  // Authorization check
  let isAuthorized = false;

  if (["admin", "global_overseer"].includes(user.role)) {
    isAuthorized = true;
  } else {
    if (type === "assignments") {
      const assignment = await Assignment.findOne({ file_path: `/uploads/assignments/${filename}` });
      if (assignment) {
        if (user.role === "teacher" && assignment.teacher_id.toString() === user._id.toString()) isAuthorized = true;
        if (user.role === "student" && assignment.assigned_to_users.includes(user._id.toString())) isAuthorized = true;
      }
    } else if (type === "submissions") {
      const submission = await Submission.findOne({ submission_file: `/uploads/submissions/${filename}` });
      if (submission) {
        if (user.role === "teacher") {
          const assignment = await Assignment.findById(submission.assignment_id);
          if (assignment && assignment.teacher_id.toString() === user._id.toString()) isAuthorized = true;
        }
        if (user.role === "student" && submission.user_id.toString() === user._id.toString()) isAuthorized = true;
      }
    } else if (type === "feedback") {
      const submission = await Submission.findOne({ feedback_file: `/uploads/feedback/${filename}` });
      if (submission) {
        if (user.role === "teacher") {
          const assignment = await Assignment.findById(submission.assignment_id);
          if (assignment && assignment.teacher_id.toString() === user._id.toString()) isAuthorized = true;
        }
        if (user.role === "student" && submission.user_id.toString() === user._id.toString()) isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) return res.status(403).json({ message: "Forbidden. You do not have permission to view this file." });

  // Stream file for serverless
  const fileBuffer = fs.readFileSync(filePath);
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  res.send(fileBuffer);
}
