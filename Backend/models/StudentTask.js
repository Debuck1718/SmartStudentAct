const mongoose = require("mongoose");

const studentTaskSchema = new mongoose.Schema(
  {
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    due_date: { type: Date },  
    is_completed: { type: Boolean, default: false },

    reminder_enabled: { type: Boolean, default: false },
    reminder_time: { type: Date }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudentTask", studentTaskSchema);
