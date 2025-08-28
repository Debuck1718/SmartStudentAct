const mongoose = require('mongoose');

const studentRewardsSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    level: { type: String, enum: ['Junior', 'High School', 'University', 'Worker'], default: 'High School' },
    
    weeklyGoalsAchieved: { type: Boolean, default: false },
    weeklyAssignmentsDone: { type: Boolean, default: false },
    weeklyBudgetMet: { type: Boolean, default: false },
    termPercentage: { type: Number, default: 0 },
    consistentMonths: { type: Number, default: 0 },
    
    pointsLog: [{
        points: { type: Number, required: true },
        source: { type: String, required: true }, 
        description: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }]
});

module.exports = mongoose.model('StudentRewards', studentRewardsSchema);