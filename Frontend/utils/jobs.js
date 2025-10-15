const agenda = require("./agenda");
require("./notifications/studentNotifications");
require("./notifications/teacherNotifications");
require("./notifications/workerNotifications");

const StudentTask = require("../api/models/StudentTask");
const Worker = require("../api/models/worker");
const Quiz = require("../api/models/Quiz");

// --- Student task reminders ---
agenda.define("task_reminder", async (job) => {
  const { taskId, studentId, hoursBefore } = job.attrs.data;
  const task = await StudentTask.findById(taskId);
  const student = await require("../api/models/User").findById(studentId);
  if (!task || !student) return;
  require("./eventBus").eventBus.emit("task_reminder", { task, student, hoursBefore });
});

// --- Worker reminders ---
agenda.define("worker_reminder", async (job) => {
  const { reminderId } = job.attrs.data;
  const worker = await Worker.findOne({ "reminders._id": reminderId });
  if (!worker) return;
  const reminder = worker.reminders.id(reminderId);
  if (!reminder || reminder.is_dismissed) return;
  require("./eventBus").eventBus.emit("worker_reminder", { worker, reminder });
});

// --- Auto-submit overdue quizzes ---
agenda.define("auto-submit overdue quizzes", async () => {
  const now = new Date();
  const quizzes = await Quiz.find({ timeLimitMinutes: { $ne: null } });
  for (const quiz of quizzes) {
    for (const submission of quiz.submissions) {
      if (!submission.submitted_at) {
        const minutesElapsed = (now - submission.started_at) / 60000;
        if (minutesElapsed >= quiz.timeLimitMinutes) {
          submission.submitted_at = now;
          submission.auto_submitted = true;
          submission.score = quiz.questions.reduce((acc, q, i) => acc + (q.correct === submission.answers[i] ? 1 : 0), 0);
        }
      }
    }
    await quiz.save();
  }
});
