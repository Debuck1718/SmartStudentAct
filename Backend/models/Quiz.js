const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }], 
  correct: { type: String, required: true }    
});

const quizSchema = new mongoose.Schema({
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  due_date: { type: Date, required: true },
  questions: [questionSchema],


  assigned_to_users: [String],   
  assigned_to_grades: [Number],
  assigned_to_schools: [String],


  submissions: [{
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    answers: [String], 
    score: Number,
    submitted_at: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
