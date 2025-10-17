// /models/Reminder.js
import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  remind_at: { type: Date },
  is_sent: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.models.Reminder ||
  mongoose.model("Reminder", reminderSchema);
