import { connectDB } from "../lib/db.js";
import models from "../models/index.js";
import { authenticateJWT } from "../middlewares/auth.js";
import { hasRole } from "../middlewares/roles.js";
import { localUpload } from "../middlewares/upload.js";
import eventBus from "../../../Frontend/utils/eventBus.js";
import logger from "../../../Frontend/utils/logger.js";

export const config = {
  api: {
    bodyParser: false, // required for file uploads
  },
};

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

    await new Promise((resolve, reject) => {
      localUpload.single("file")(req, res, (err) => (err ? reject(err) : resolve()));
    });

    const { assignmentId, submissionText } = req.body;
    const studentId = req.user.id;

    if (!assignmentId) {
      return res.status(400).json({ message: "Missing assignmentId." });
    }

    const { Submission } = models;
    const newSubmission = new Submission({
      assignment_id: assignmentId,
      user_id: studentId,
      submission_file: req.file ? `/uploads/submissions/${req.file.filename}` : null,
      submission_text: submissionText || null,
      submitted_at: new Date(),
    });

    await newSubmission.save();

    eventBus.emit("new_submission", { assignmentId, studentId });

    res.status(201).json({
      message: "Submission successful!",
      submission: newSubmission,
    });
  } catch (error) {
    logger.error("Error submitting assignment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}
