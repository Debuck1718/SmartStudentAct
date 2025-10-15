import { connectDb } from "../../../utils/connectDb";
import { authenticateJWT } from "../../../middlewares/auth";
import Assignment from "../../../models/Assignment";
import Submission from "../../../models/Submission";
import path from "path";

export default async function handler(req, res) {
  await connectDb();
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  const user = await authenticateJWT(req);
  if (!user || user.role !== "global_overseer") return res.status(403).json({ message: "Forbidden" });

  try {
    const assignments = await Assignment.find({ attachment_file: { $ne: null } }).select("title attachment_file created_by");
    const submissions = await Submission.find({ $or: [{ submission_file: { $ne: null } }, { feedback_file: { $ne: null } }] }).populate("user_id", "email");

    const assignmentFiles = assignments.map((a) => ({
      id: a._id,
      filename: path.basename(a.attachment_file),
      type: "Assignment",
      filePath: a.attachment_file,
      created_by: a.created_by,
    }));

    const submissionFiles = submissions.flatMap((s) => {
      const files = [];
      if (s.submission_file) files.push({ id: s._id, filename: path.basename(s.submission_file), type: "Submission", filePath: s.submission_file, uploaded_by: s.user_id?.email || "Unknown" });
      if (s.feedback_file) files.push({ id: s._id, filename: path.basename(s.feedback_file), type: "Feedback", filePath: s.feedback_file, uploaded_by: s.user_id?.email || "Unknown" });
      return files;
    });

    res.status(200).json({ success: true, files: [...assignmentFiles, ...submissionFiles] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to retrieve files." });
  }
}
