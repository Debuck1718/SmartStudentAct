// models/WorkerRewards.js
const mongoose = require("mongoose");

const workerRewardsSchema = new mongoose.Schema({
  workerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  level: { type: String, enum: ["Worker"], default: "Worker" },

  // Core personal performance metrics
  weeklyGoalsCompleted: { type: Boolean, default: false },
  remindersSet: { type: Number, default: 0 }, // tracks how many reminders were used
  budgetMaintained: { type: Boolean, default: false },
  consistencyWeeks: { type: Number, default: 0 }, // streak of consistent planning
  productivityScore: { type: Number, default: 0 }, // general metric based on performance

  // Points and reward history
  pointsLog: [
    {
      points: { type: Number, required: true },
      source: { type: String, required: true }, // e.g., "Reminder", "Budget", "Goal"
      description: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    },
  ],
}, { timestamps: true });

// Calculate total points dynamically
workerRewardsSchema.virtual("totalPoints").get(function () {
  return this.pointsLog.reduce((acc, p) => acc + p.points, 0);
});

module.exports = mongoose.models.WorkerRewards || mongoose.model("WorkerRewards", workerRewardsSchema);
