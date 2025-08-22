// models/quiz.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }], // multiple choice options
  correct: { type: String, required: true }    // e.g. "A", "B", "C", "D"
});

const quizSchema = new mongoose.Schema({
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  due_date: { type: Date, required: true },
  questions: [questionSchema],

  // assignment targeting
  assigned_to_users: [String],   // student emails
  assigned_to_grades: [Number],
  assigned_to_schools: [String],

  // tracking
  submissions: [{
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    answers: [String], // student's selected answers in order
    score: Number,
    submitted_at: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
