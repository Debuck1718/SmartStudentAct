const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submission_text: String,  
  submission_file: String,
  submitted_at: Date,
  feedback_grade: Number,
  feedback_comments: String,
  feedback_file: String,
  feedback_given_at: Date
}, { timestamps: true });


module.exports = mongoose.model('Submission', submissionSchema);
