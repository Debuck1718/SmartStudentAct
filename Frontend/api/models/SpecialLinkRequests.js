const mongoose = require('mongoose');

const specialLinkRequestSchema = new mongoose.Schema({
  requester_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  request_type: { type: String, enum: ['special_student', 'special_teacher'], required: true },
  message: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  created_at: { type: Date, default: Date.now },
  responded_at: { type: Date }
});

module.exports = mongoose.model('SpecialLinkRequest', specialLinkRequestSchema);
