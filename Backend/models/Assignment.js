import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema(
  {
    teacher_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    file_path: { type: String, default: null, trim: true },
    due_date: { type: Date, required: true },


    assigned_to_users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    assigned_to_grades: [{ type: Number, min: 1, max: 12 }],
    assigned_to_levels: [{ type: String, enum: ["100", "200", "300", "400"] }],
    assigned_to_programs: [{ type: String, trim: true }],
    assigned_to_schools: [{ type: mongoose.Schema.Types.ObjectId, ref: "School" }],
    assigned_to_other_grades: [{ type: Number, min: 1, max: 12 }],
  },
  { timestamps: true }
);

const Assignment =
  mongoose.models.Assignment || mongoose.model("Assignment", assignmentSchema);

export default Assignment;



