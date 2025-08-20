// In models/School.js

const mongoose = require('mongoose');

// This schema defines the structure for a 'School' document in MongoDB.
const schoolSchema = new mongoose.Schema({
  // The name of the school.
  // It's set to be unique to prevent duplicate school entries and is trimmed
  // to remove any accidental whitespace.
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // The country of the school, using ISO codes (e.g., 'ZA', 'GH').
  // The data is automatically trimmed and converted to uppercase for consistency.
  country: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },

  // The pricing tier for the school.
  // The 'pricingService' uses this value to determine the subscription price.
  // For example, 1 = normal pricing, 3 or 4 = premium pricing.
  tier: {
    type: Number,
    required: true
  }
},
{
  // Mongoose automatically adds 'createdAt' and 'updatedAt' timestamps.
  // This is a best practice for tracking when records were created and modified.
  timestamps: true
});

module.exports = mongoose.model('School', schoolSchema);
