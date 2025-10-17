import express from "express";

import advice from "./advice.js";
import assignments from "./assignments.js";
import check from "./check.js";
import messages from "./messages.js";
import reminders from "./reminders.js";
import milestones from "./milestones.js";
import teachers from "./teachers.js";
import tasks from "./tasks.js";
import tasksComplete from "./tasks-complete.js";

// budget
import addEntry from "./budget/add-entry.js";
import dashboard from "./budget/dashboard.js";
import entriesIndex from "./budget/entries/index.js";
import entryById from "./budget/entries/[entryId].js";

// goals
import goalsIndex from "./goals/index.js";
import goalById from "./goals/[goalId].js";

// quizzes
import quizzesIndex from "./quizzes/index.js";
import quizResult from "./quizzes/[quizId]/result.js";
import quizSubmit from "./quizzes/[quizId]/submit.js";

// submissions
import submissions from "./submissions.js";
import submissionByFilename from "./submissions[filename].js";

const router = express.Router();

router.use("/advice", advice);
router.use("/assignments", assignments);
router.use("/check", check);
router.use("/messages", messages);
router.use("/reminders", reminders);
router.use("/milestones", milestones);
router.use("/teachers", teachers);
router.use("/tasks", tasks);
router.use("/tasks-complete", tasksComplete);

router.use("/budget/add-entry", addEntry);
router.use("/budget/dashboard", dashboard);
router.use("/budget/entries", entriesIndex);
router.use("/budget/entries/:entryId", entryById);

router.use("/goals", goalsIndex);
router.use("/goals/:goalId", goalById);

router.use("/quizzes", quizzesIndex);
router.use("/quizzes/:quizId/result", quizResult);
router.use("/quizzes/:quizId/submit", quizSubmit);

router.use("/submissions", submissions);
router.use("/submissions/:filename", submissionByFilename);

export default router;
