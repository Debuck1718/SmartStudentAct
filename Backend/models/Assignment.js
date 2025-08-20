const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String,
  description: String,
  file_path: String,
  due_date: Date,
  assigned_to_users: [String],    // storing student emails
  assigned_to_grades: [Number],
  assigned_to_schools: [String]
}, { timestamps: true });

module.exports = mongoose.model('Assignment', assignmentSchema);
