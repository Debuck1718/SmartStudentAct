const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  category: String,
  entry_date: { type: Date, required: true },
  description: String
}, { timestamps: true });

module.exports = mongoose.model('Budget', budgetSchema);
