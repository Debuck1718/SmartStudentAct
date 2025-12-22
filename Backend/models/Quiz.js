import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  type: {
    type: String,
    enum: ['multiple-choice', 'checkboxes', 'short-answer'],
    default: 'multiple-choice'
  },
  points: { type: Number, default: 1 },
  options: [String],
  correct: [String], // Array of correct answers
});

const answerDetailSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  answer: { type: mongoose.Schema.Types.Mixed }, // Student's answer (String or [String])
  isCorrect: { type: Boolean, default: null }, // null for manually graded questions
  pointsAwarded: { type: Number, default: 0 }
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  answers: [answerDetailSchema],
  score: Number,
  status: {
    type: String,
    enum: ['in-progress', 'submitted', 'graded'],
    default: 'in-progress'
  },
  started_at: { type: Date, default: Date.now },
  submitted_at: { type: Date },
  auto_submitted: { type: Boolean, default: false },
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
