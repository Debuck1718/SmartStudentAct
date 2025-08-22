const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    completed: { type: Boolean, default: false },
    target_value: { type: Number, default: 100 },
    current_value: { type: Number, default: 0 }
}, { timestamps: true });

// Optional: index for faster queries on user goals
goalSchema.index({ user_id: 1 });

module.exports = mongoose.model('Goal', goalSchema);
