const mongoose = require('mongoose');

const specialLinkSchema = new mongoose.Schema({
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approved_at: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
});

specialLinkSchema.index({ teacher_id: 1, student_id: 1 }, { unique: true });

module.exports = mongoose.model('SpecialLink', specialLinkSchema);
