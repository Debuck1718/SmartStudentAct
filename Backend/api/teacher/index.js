import express from "express";

import addPoints from "./add-points.js";
import assignment from "./assignment.js";
import calendar from "./calendar.js";
import check from "./check.js";
import detect from "./detect.js";
import message from "./message.js";
import profile from "./profile.js";
import quizzes from "./quizzes.js";
import students from "./students.js";
import studentsOther from "./students-other.js";
import viewPoints from "./view-points.js";
import feedback from "./feedback/[submissionId].js";

const router = express.Router();

router.use("/add-points", addPoints);
router.use("/assignments", assignment);
router.use("/calendar", calendar);
router.use("/check", check);
router.use("/detect", detect);
router.use("/message", message);
router.use("/profile", profile);
router.use("/quizzes", quizzes);
router.use("/students", students);
router.use("/students-other", studentsOther);
router.use("/view-points", viewPoints);
router.use("/feedback", feedback);

export default router;
