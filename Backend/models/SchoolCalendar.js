// models/SchoolCalendar.js
import mongoose from 'mongoose';

const SchoolCalendarSchema = new mongoose.Schema({
  teacher_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  schoolName: {
    type: String,
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  terms: [
    {
      termName: {
        type: String,
        required: true
      },
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      }
    }
  ]
}, { timestamps: true });

SchoolCalendarSchema.index({ school: 1, academicYear: 1 }, { unique: true });

const SchoolCalendar = mongoose.models.SchoolCalendar || mongoose.model('SchoolCalendar', SchoolCalendarSchema);

export default SchoolCalendar;
