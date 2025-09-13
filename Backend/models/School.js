const mongoose = require('mongoose');

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

module.exports = mongoose.model('School', schoolSchema);



