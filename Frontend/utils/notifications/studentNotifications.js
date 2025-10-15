const { eventBus, notifyUser, emailTemplates } = require("../eventBus");
const User = require("../../api/models/User");
const StudentTask = require("../../api/models/StudentTask");
const Assignment = require("../../api/models/Assignment");
const Quiz = require("../../api/models/Quiz");

// --- Task reminders ---
eventBus.on("task_reminder", async ({ task, student, hoursBefore }) => {
  await notifyUser(
    student,
    "Task Reminder",
    `Your task "${task.title}" is due in ${hoursBefore} hours.`,
    "/student/tasks",
    null
  );
});

// --- Assignment notifications ---
eventBus.on("assignment_created", async ({ assignmentId }) => {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) return;

  const students = await User.find({ role: "student", _id: { $in: assignment.assigned_to_users } }).select("_id phone email firstname PushSub");
  for (const student of students) {
    await notifyUser(
      student,
      "New Assignment",
      `"${assignment.title}" is due on ${assignment.due_date.toDateString()}`,
      "/student/assignments",
      emailTemplates.assignmentNotification,
      { firstname: student.firstname, assignmentTitle: assignment.title }
    );
  }
});

// --- Quiz notifications ---
eventBus.on("quiz_created", async ({ quizId }) => {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) return;

  const students = await User.find({ role: "student", _id: { $in: quiz.assigned_to_users } }).select("_id phone email firstname PushSub");
  for (const student of students) {
    await notifyUser(
      student,
      "New Quiz",
      `"${quiz.title}" is now available!`,
      "/student/quizzes",
      emailTemplates.quizNotification,
      { firstname: student.firstname, quizTitle: quiz.title }
    );
  }
});
