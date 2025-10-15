const { eventBus, notifyUser, emailTemplates } = require("../eventBus");
const Worker = require("../../api/models/worker");

// Worker reminders
eventBus.on("worker_reminder", async ({ worker, reminder }) => {
  await notifyUser(
    worker,
    "Reminder",
    `${reminder.title} is due on ${new Date(reminder.due_date).toDateString()}`,
    "/worker/reminders",
    null
  );
});

// Goal notifications
eventBus.on("goal_notification", async ({ workerId, message }) => {
  const worker = await Worker.findById(workerId);
  if (!worker) return;
  await notifyUser(
    worker,
    "Goal Update",
    message,
    "/worker/goals",
    emailTemplates.goalBudgetUpdate
  );
});
