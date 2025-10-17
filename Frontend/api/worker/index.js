import express from "express";

import addGoal from "./add-goal.js";
import addReminder from "./add-reminder.js";
import addTransaction from "./add-transaction.js";
import create from "./create.js";
import insights from "./insights.js";
import overview from "./overview.js";
import rewards from "./rewards.js";
import updateProgress from "./update-progress.js";

const router = express.Router();

router.use("/add-goal", addGoal);
router.use("/add-reminder", addReminder);
router.use("/add-transaction", addTransaction);
router.use("/create", create);
router.use("/insights", insights);
router.use("/overview", overview);
router.use("/rewards", rewards);
router.use("/update-progress", updateProgress);

export default router;
