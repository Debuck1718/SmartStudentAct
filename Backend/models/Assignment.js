const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
    teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    file_path: { type: String, default: null },
    due_date: { type: Date, required: true },

    // Targets
    assigned_to_users: [{ type: String, lowercase: true, trim: true }], 
    assigned_to_grades: [{ type: Number, min: 1, max: 12 }], 
    assigned_to_levels: [{ type: String, enum: ["100", "200", "300", "400"] }], 
    assigned_to_programs: [{ type: String, trim: true }], 
    assigned_to_schools: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assignment", assignmentSchema);

