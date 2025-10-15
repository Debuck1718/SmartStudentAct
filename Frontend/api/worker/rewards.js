// routes/worker/rewards.js
const express = require("express");
const router = express.Router();
const Joi = require("joi");
const logger = require("../../utils/logger");
const eventBus = require("../../utils/eventBus");
const { authenticateJWT } = require("../../middlewares/auth");
const checkSubscription = require("../../middlewares/checkSubscription");

const WorkerRewards = require("../../models/WorkerRewards");

// --- Validation Schemas ---
const rewardActionSchema = Joi.object({
  source: Joi.string()
    .valid("Reminder", "Goal", "Budget", "Consistency", "Productivity")
    .required(),
  points: Joi.number().integer().min(1).max(100).required(),
  description: Joi.string().max(300).required(),
});


// --- Add Reward Points (e.g., when a worker completes a task) ---
router.post("/add", authenticateJWT, checkSubscription, async (req, res) => {
  const { error, value } = rewardActionSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      status: "Validation Error",
      message: error.details[0].message,
    });
  }

  try {
    const { points, source, description } = value;
    let worker = await WorkerRewards.findOne({ workerId: req.userId });

    if (!worker) {
      // create new worker reward profile
      worker = new WorkerRewards({
        workerId: req.userId,
        name: req.user?.firstname + " " + req.user?.lastname || "Unknown Worker",
      });
    }

    // Add new reward entry
    worker.pointsLog.push({ points, source, description });

    // Track activity consistency
    if (source === "Consistency") {
      worker.consistencyWeeks += 1;
    }

    // Track reminders and budgets
    if (source === "Reminder") worker.remindersSet += 1;
    if (source === "Budget") worker.budgetMaintained = true;
    if (source === "Goal") worker.weeklyGoalsCompleted = true;

    await worker.save();

    // Emit reward notification
    eventBus.emit("reward_notification", {
      userId: req.userId,
      message: `You've earned ${points} points for ${source.toLowerCase()}!`,
    });

    res.status(201).json({
      message: "Reward points added successfully.",
      totalPoints: worker.totalPoints,
      worker,
    });
  } catch (err) {
    logger.error("Error adding worker reward:", err);
    res.status(500).json({
      message: "Failed to add worker reward.",
      error: err.message,
    });
  }
});


// --- Get Worker Reward Dashboard ---
router.get("/dashboard", authenticateJWT, async (req, res) => {
  try {
    const worker = await WorkerRewards.findOne({ workerId: req.userId });
    if (!worker) {
      return res.status(404).json({ message: "Worker reward record not found." });
    }

    res.status(200).json({
      name: worker.name,
      totalPoints: worker.totalPoints,
      productivityScore: worker.productivityScore,
      consistencyWeeks: worker.consistencyWeeks,
      remindersSet: worker.remindersSet,
      budgetMaintained: worker.budgetMaintained,
      lastUpdated: worker.updatedAt,
      pointsLog: worker.pointsLog.slice(-10).reverse(), // show last 10 activities
    });
  } catch (err) {
    logger.error("Error loading worker reward dashboard:", err);
    res.status(500).json({
      message: "Failed to load worker reward dashboard.",
      error: err.message,
    });
  }
});


// --- Leaderboard (Top 10 Workers) ---
router.get("/leaderboard", async (req, res) => {
  try {
    const leaderboard = await WorkerRewards.aggregate([
      {
        $addFields: {
          totalPoints: { $sum: "$pointsLog.points" },
        },
      },
      { $sort: { totalPoints: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          workerId: 1,
          name: 1,
          totalPoints: 1,
          consistencyWeeks: 1,
          productivityScore: 1,
        },
      },
    ]);

    res.status(200).json({ leaderboard });
  } catch (err) {
    logger.error("Error fetching worker leaderboard:", err);
    res.status(500).json({
      message: "Failed to load leaderboard.",
      error: err.message,
    });
  }
});


module.exports = router;
