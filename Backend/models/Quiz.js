import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correct: { type: String, required: true },
});

const submissionSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  answers: [String],
  score: Number,
  started_at: { type: Date, default: Date.now },
  submitted_at: { type: Date },
  auto_submitted: { type: Boolean, default: false },
  last_saved_at: { type: Date, default: Date.now },
});

const quizSchema = new mongoose.Schema(
  {
    teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String },
    due_date: { type: Date, required: true },
    timeLimitMinutes: { type: Number, default: null },
    questions: [questionSchema],
    assigned_to_users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    assigned_to_grades: [Number],
    assigned_to_programs: [String],
    assigned_to_schools: [{ type: mongoose.Schema.Types.ObjectId, ref: "School" }],
    assigned_to_other_grades: [Number],
    submissions: [submissionSchema],
  },
  { timestamps: true }
);

const Quiz = mongoose.model("Quiz", quizSchema);
export default Quiz;


