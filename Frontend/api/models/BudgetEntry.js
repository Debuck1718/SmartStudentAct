// In models/BudgetEntry.js

const mongoose = require('mongoose');

const budgetEntrySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    description: { type: String },
    type: {
        type: String,
        enum: ['income', 'expense'],
        required: true
    },
    date: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('BudgetEntry', budgetEntrySchema);