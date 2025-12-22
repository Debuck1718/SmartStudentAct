import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    submission_text: { type: String },
    submission_file: { type: String },
    submitted_at: { type: Date },
    feedback_grade: { type: Number },
    feedback_comments: { type: String },
    feedback_file: { type: String },
    feedback_given_at: { type: Date },
  },
  { timestamps: true }
);

const Submission = mongoose.model("Submission", submissionSchema);

export default Submission;
