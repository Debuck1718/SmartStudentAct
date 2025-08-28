const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  country: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },

  tier: {
    type: Number,
    required: true
  }
},
{

  timestamps: true
});

module.exports = mongoose.model('School', schoolSchema);
