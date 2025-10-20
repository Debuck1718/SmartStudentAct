import mongoose from "mongoose";

const workerRewardsSchema = new mongoose.Schema(
  {
    workerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    level: { type: String, enum: ["Worker"], default: "Worker" },

    // Core personal performance metrics
    weeklyGoalsCompleted: { type: Boolean, default: false },
    remindersSet: { type: Number, default: 0 },
    budgetMaintained: { type: Boolean, default: false },
    consistencyWeeks: { type: Number, default: 0 },
    productivityScore: { type: Number, default: 0 },

    // Points and reward history
    pointsLog: [
      {
        points: { type: Number, required: true },
        source: { type: String, required: true },
        description: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Virtual total points
workerRewardsSchema.virtual("totalPoints").get(function () {
  return this.pointsLog.reduce((acc, p) => acc + p.points, 0);
});

const WorkerRewards =
  mongoose.models.WorkerRewards ||
  mongoose.model("WorkerRewards", workerRewardsSchema);

export default WorkerRewards;
