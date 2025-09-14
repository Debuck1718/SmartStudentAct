// utils/eventBus.js
const EventEmitter = require("events");
const webpush = require("web-push");
const smsApi = require("./sms");
const logger = require("./logger");
const mailer = require("./email");
const mongoose = require("mongoose");
const Agenda = require("agenda");

const User = mongoose.models.User;
const Assignment = mongoose.models.Assignment;
const StudentTask = mongoose.models.StudentTask;
const Quiz = mongoose.models.Quiz;

// ✅ Initialize Agenda with MongoDB
const agenda = new Agenda({
  db: {
    address: process.env.MONGO_URI,
    collection: "agendaJobs",
  },
  processEvery: "30 seconds", // how often agenda checks
});

// This is the single instance of our event bus that will be shared across the application.
const eventBus = new EventEmitter();

const emailTemplates = {
  otp: 3,
  welcome: 2,
  passwordReset: 4,
  assignmentNotification: 6,
  quizNotification: 5,
  feedbackReceived: 7,
  gradedAssignment: 8,
  rewardNotification: 9,
  goalBudgetUpdate: 10,
};

webpush.setVapidDetails(
  "mailto:support@smartstudentact.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendSMS(phone, message) {
  if (!phone) return;
  const recipient = phone.startsWith("+") ? phone : `+${phone}`;
  try {
    await smsApi.sendTransacSms({
      sender: process.env.BREVO_SMS_SENDER || "SmartStudentAct",
      recipient,
      content: message,
    });
    logger.info(`[Brevo SMS] Sent to ${recipient}: ${message}`);
  } catch (err) {
    logger.error(`[Brevo SMS] Failed to send to ${recipient}: ${err.message}`);
  }
}

async function sendPushToUser(pushSub, payload) {
  try {
    if (pushSub?.subscription) {
      await webpush.sendNotification(pushSub.subscription, JSON.stringify(payload));
    }
  } catch (err) {
    logger.error(`Push notification failed: ${err.message}`);
  }
}

async function notifyUser(user, title, message, url, emailTemplateId, templateVariables = {}) {
  try {
    if (user.PushSub) {
      await sendPushToUser(user.PushSub, { title, body: message, url });
    }

    if (user.phone) {
      await sendSMS(user.phone, `${title}: ${message}`);
    }

    if (user.email && emailTemplateId) {
      await mailer.sendTemplateEmail(user.email, emailTemplateId, templateVariables);
      logger.info(`[Brevo Email] Sent "${title}" to ${user.email}`);
    }
  } catch (err) {
    logger.error(`notifyUser failed for ${user._id}: ${err.message}`);
  }
}

async function fetchStudentsForAssignmentOrQuiz(item) {
  const userIds = item.assigned_to_users || [];
  const grades = item.assigned_to_grades || [];
  const otherGrades = item.assigned_to_other_grades || [];
  const schools = item.assigned_to_schools || [];

  const students = await User.find({
    role: "student",
    $or: [
      { _id: { $in: userIds } },
      { grade: { $in: grades } },
      { _id: { $in: otherGrades } },
      { school: { $in: schools } },
    ],
  }).select("_id phone email firstname PushSub");

  return students;
}

/* --------------------- Agenda Job Definitions --------------------- */
agenda.define("assignment_reminder", async (job) => {
  const { assignmentId, hoursBefore } = job.attrs.data;
  try {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return;

    const students = await fetchStudentsForAssignmentOrQuiz(assignment);

    for (const student of students) {
      await notifyUser(
        student,
        "Assignment Reminder",
        `"${assignment.title}" is due in ${hoursBefore} hours.`,
        "/student/assignments",
        emailTemplates.assignmentNotification,
        {
          firstname: student.firstname,
          assignmentTitle: assignment.title,
          dueDate: assignment.due_date.toDateString(),
          hoursBefore,
        }
      );
    }
  } catch (err) {
    logger.error(`assignment_reminder job failed: ${err.message}`);
  }
});

agenda.define("task_reminder", async (job) => {
  const { taskId, studentId, title, hoursBefore } = job.attrs.data;
  try {
    const student = await User.findById(studentId).select("_id phone email firstname PushSub");
    const task = await StudentTask.findById(taskId);
    if (!student || !task) return;

    await notifyUser(
      student,
      "Task Reminder",
      `Your task "${title}" is due in ${hoursBefore} hours.`,
      "/student/tasks",
      null
    );
  } catch (err) {
    logger.error(`task_reminder job failed: ${err.message}`);
  }
});

/* --------------------- Event Listeners --------------------- */
eventBus.on("assignment_created", async ({ assignmentId, title }) => {
  try {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return;

    const students = await fetchStudentsForAssignmentOrQuiz(assignment);

    for (const student of students) {
      await notifyUser(
        student,
        "New Assignment",
        `"${title}" is due on ${assignment.due_date.toDateString()}`,
        "/student/assignments",
        emailTemplates.assignmentNotification,
        {
          firstname: student.firstname,
          assignmentTitle: title,
          dueDate: assignment.due_date.toDateString(),
        }
      );
    }

    const reminderHours = [6, 2];
    for (const hoursBefore of reminderHours) {
      const remindTime = new Date(assignment.due_date);
      remindTime.setHours(remindTime.getHours() - hoursBefore);

      if (remindTime > new Date()) {
        await agenda.schedule(remindTime, "assignment_reminder", {
          assignmentId,
          hoursBefore,
        });
      }
    }
  } catch (err) {
    logger.error(`assignment_created event failed: ${err.message}`);
  }
});

eventBus.on("task_created", async ({ taskId, studentId, title }) => {
  try {
    const task = await StudentTask.findById(taskId);
    const student = await User.findById(studentId).select("_id phone email firstname PushSub");
    if (!task || !student) return;

    await notifyUser(
      student,
      "Task Created",
      `Your task "${title}" is set for ${task.due_date.toDateString()}`,
      "/student/tasks",
      null
    );

    const reminderHours = [6, 2];
    for (const hoursBefore of reminderHours) {
      const remindTime = new Date(task.due_date);
      remindTime.setHours(remindTime.getHours() - hoursBefore);

      if (remindTime > new Date()) {
        await agenda.schedule(remindTime, "task_reminder", {
          taskId,
          studentId,
          title,
          hoursBefore,
        });
      }
    }
  } catch (err) {
    logger.error(`task_created event failed: ${err.message}`);
  }
});

// ... keep your quiz_created, feedback_given, assignment_graded, reward_granted,
// goal_notification, and budget_notification events as they are ...

eventBus.setMaxListeners(50);


(async function () {
  try {
    await agenda.start();
    logger.info("✅ Agenda started and ready for scheduled jobs.");
  } catch (err) {
    logger.error(`Agenda failed to start: ${err.message}`);
  }
})();

module.exports = { eventBus, emailTemplates, agenda };


