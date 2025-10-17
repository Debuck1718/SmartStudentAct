import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    assignment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    submission_text: { type: String, trim: true },
    submission_file: { type: String, trim: true },
    submitted_at: { type: Date, default: Date.now },
    feedback_grade: { type: Number, min: 0, max: 100 },
    feedback_comments: { type: String, trim: true },
    feedback_file: { type: String, trim: true },
    feedback_given_at: { type: Date },
  },
  { timestamps: true }
);


const Submission =
  mongoose.models.Submission || mongoose.model("Submission", submissionSchema);

export default Submission;

