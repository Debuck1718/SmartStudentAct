// models/School.js
import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
  {
    schoolName: {
      type: String,
      required: true,
      trim: true,
    },
    schoolCountry: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    tier: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

schoolSchema.index({ schoolName: 1, schoolCountry: 1 }, { unique: true });

export const School = mongoose.model("School", schoolSchema);
export default School;

