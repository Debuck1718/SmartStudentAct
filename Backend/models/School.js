const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema(
  {
    schoolName: {
      type: String,
      required: true,
      unique: true,
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

module.exports = mongoose.model('School', schoolSchema);


