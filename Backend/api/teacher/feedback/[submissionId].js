// /api/teacher/feedback/[submissionId].js
import { connectDb } from "../../../../Frontend/utils/connectDb";
import { withMiddleware } from "../../../../Frontend/utils/withMiddleware";
import { authenticateJWT, hasRole } from "../../../../Frontend/api/middlewares/auth";
import Submission from "../../../../Frontend/api/models/Submission";
import Assignment from "../../../../Frontend/api/models/Assignment";

async function handler(req, res) {
  await connectDb();

  const { submissionId } = req.query;

  if (req.method === "POST") {
    const { feedback_grade, feedback_comments } = req.body;

    const submission = await Submission.findById(submissionId).populate("assignment_id");
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    const assignment = submission.assignment_id;
    if (!assignment || assignment.teacher_id.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to give feedback" });
    }

    submission.feedback_grade = feedback_grade || submission.feedback_grade;
    submission.feedback_comments = feedback_comments || submission.feedback_comments;
    submission.feedback_given_at = new Date();

    await submission.save();
    return res.status(200).json({ message: "Feedback saved", submission });
  }

  res.status(405).json({ message: "Method not allowed" });
}

export default withMiddleware(handler, [authenticateJWT, (req, res, next) => hasRole(["teacher"])(req, res, next)]);
