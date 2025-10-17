import mongoose from "mongoose";

import User from "./User.js";
import Assignment from "./Assignment.js";
import Submission from "./Submission.js";
import Budget from "./Budget.js";
import BudgetEntry from "./BudgetEntry.js";
import School from "./School.js";
import SchoolCalendar from "./SchoolCalendar.js";
import Goal from "./Goal.js";
import StudentRewards from "./StudentRewards.js";
import Reward from "./Reward.js";
import Quiz from "./Quiz.js";
import StudentTask from "./StudentTask.js";
import Message from "./Message.js";
import PushSub from "./PushSub.js";
import Worker from "./worker.js";
import WorkerRewards from "./WorkerRewards.js"; 
import Reminder from "./Reminder.js";// ✅ added

const models = {
  User: mongoose.models.User || User,
  Assignment: mongoose.models.Assignment || Assignment,
  Submission: mongoose.models.Submission || Submission,
  Budget: mongoose.models.Budget || Budget,
  BudgetEntry: mongoose.models.BudgetEntry || BudgetEntry,
  School: mongoose.models.School || School,
  SchoolCalendar: mongoose.models.SchoolCalendar || SchoolCalendar,
  Goal: mongoose.models.Goal || Goal,
  StudentRewards: mongoose.models.StudentRewards || StudentRewards,
  Reward: mongoose.models.Reward || Reward,
  Quiz: mongoose.models.Quiz || Quiz,
  StudentTask: mongoose.models.StudentTask || StudentTask,
  Message: mongoose.models.Message || Message,
  PushSub: mongoose.models.PushSub || PushSub,
  Worker: mongoose.models.Worker || Worker,
  WorkerRewards: mongoose.models.WorkerRewards || WorkerRewards, // ✅ added
};

// Export all models in a single object
export default models;

// Optional: also export individually for named imports
export {
  User,
  Assignment,
  Submission,
  Budget,
  BudgetEntry,
  School,
  SchoolCalendar,
  Goal,
  StudentRewards,
  Reward,
  Quiz,
  StudentTask,
  Message,
  PushSub,
  Worker,
  WorkerRewards, 
  Reminder,// ✅ added
};
