// utils/eventBus.js
import dotenv from "dotenv";
dotenv.config(); // ✅ Load environment variables first

import EventEmitter from "events";
import webpush from "web-push";
import smsApi from "./sms.js";
import logger from "./logger.js";
import mongoose from "mongoose";
import Agenda from "agenda";
import mailer, { TEMPLATE_IDS as EMAIL_TEMPLATES } from "./email.js";

// In-memory ring buffer for recent notification logs (diagnostics)
const NOTIFY_LOG_BUFFER_SIZE = 500;
const notifyLogs = [];
function pushNotifyLog(entry) {
  try {
    notifyLogs.push({ ts: new Date().toISOString(), ...entry });
    if (notifyLogs.length > NOTIFY_LOG_BUFFER_SIZE) notifyLogs.shift();
  } catch {}
}
export function getNotifyLogs() {
  return [...notifyLogs];
}

const User = mongoose.models.User;
const Assignment = mongoose.models.Assignment;
const StudentTask = mongoose.models.StudentTask;
const Quiz = mongoose.models.Quiz;
const PushSubModel = mongoose.models.PushSub;

// ✅ Ensure Mongo URI exists before Agenda starts
if (!process.env.MONGODB_URI) {
  logger.error("❌ Missing MONGODB_URI in environment. Agenda will not start.");
}

// ✅ Initialize Agenda only if a MongoDB URI is configured. Otherwise use a no-op stub
let agenda;
if (!process.env.MONGODB_URI) {
  // Create an API-compatible no-op agenda to avoid runtime crashes when Mongo is unavailable
  agenda = {
    define: () => {},
    schedule: async () => {},
    start: async () => {},
    every: async () => {},
    on: () => {},
  };
} else {
  agenda = new Agenda({
    db: { address: process.env.MONGODB_URI, collection: "jobs" },
  });

  agenda.on("ready", async () => {
    logger.info("✅ Agenda connected, starting...");
    await agenda.start();
  });
}

// Shared event bus instance
const eventBus = new EventEmitter();

// ✅ Email templates come from utils/email.js (Brevo)

// ✅ Configure VAPID for push notifications safely
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:support@smartstudentact.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  logger.info("✅ Web Push VAPID keys configured successfully");
} else {
  logger.warn("⚠️ Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY — Push notifications disabled");
}

// ===== Utility functions =====
async function withRetry(fn, { attempts = 3, baseDelayMs = 500, factor = 2, jitter = true, label = "op" } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      const delay = Math.min(15000, baseDelayMs * Math.pow(factor, i - 1)) * (jitter ? (0.7 + Math.random() * 0.6) : 1);
      logger.warn(`[Retry] ${label} attempt ${i}/${attempts} failed: ${err.message}. Retrying in ${Math.round(delay)}ms`);
      if (i < attempts) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function sendSMS(phone, message) {
  if (!phone) return;
  if (!process.env.BREVO_API_KEY) {
    logger.warn("[SMS] ⚠️ BREVO_API_KEY missing — skipping SMS send");
    return;
  }

  const recipient = phone.startsWith("+") ? phone : `+${phone}`;
  try {
    await withRetry(
      async (attempt) => {
        await smsApi.sendTransacSms({
          sender: process.env.BREVO_SMS_SENDER || "SmartStudentAct",
          recipient,
          content: message,
        });
        logger.info(`[Brevo SMS] Sent to ${recipient} (attempt ${attempt})`);
      },
      { attempts: 3, baseDelayMs: 800, label: "brevo_sms" }
    );
    return { ok: true };
  } catch (err) {
    logger.error(`[Brevo SMS] Failed to send to ${recipient}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function sendPushToUser(pushSub, payload) {
  if (!pushSub?.subscription) return { ok: false, error: "missing_subscription" };
  try {
    await withRetry(
      async (attempt) => {
        await webpush.sendNotification(pushSub.subscription, JSON.stringify(payload));
        logger.info(`[WebPush] Sent push (attempt ${attempt})`);
      },
      { attempts: 3, baseDelayMs: 500, label: "webpush" }
    );
    return { ok: true };
  } catch (err) {
    logger.error(`[WebPush] Failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function notifyUser(user, title, message, url, emailTemplateId, templateVariables = {}) {
  const result = { email: { ok: false }, sms: { ok: false }, push: { ok: false } };
  try {
    // Ensure we have PushSub if not attached
    if (!user.PushSub && user._id && PushSubModel) {
      const found = await PushSubModel.findOne({ user_id: user._id }).lean();
      if (found) user.PushSub = found;
    }

    // Push
    if (user.PushSub) {
      const pushRes = await sendPushToUser(user.PushSub, { title, body: message, url });
      result.push = pushRes;
      pushNotifyLog({ channel: "push", user: user.email || user._id, ok: !!pushRes.ok, error: pushRes.error || null, title });
    } else {
      result.push = { ok: false, error: "no_push_subscription" };
    }

    // SMS
    if (user.phone) {
      const smsRes = await sendSMS(user.phone, `${title}: ${message}`);
      result.sms = smsRes || { ok: true };
      pushNotifyLog({ channel: "sms", user: user.email || user._id, ok: !!result.sms.ok, error: result.sms.error || null, title });
    } else {
      result.sms = { ok: false, error: "no_phone" };
    }

    // Email (Brevo)
    if (user.email && emailTemplateId) {
      try {
        await withRetry(
          async (attempt) => {
            await mailer.sendTemplateEmail(user.email, emailTemplateId, templateVariables);
            logger.info(`[Brevo Email] Sent "${title}" to ${user.email} (attempt ${attempt})`);
          },
          { attempts: 3, baseDelayMs: 800, label: "brevo_email" }
        );
        result.email = { ok: true };
        pushNotifyLog({ channel: "email", user: user.email || user._id, ok: true, error: null, title, template: emailTemplateId });
      } catch (err) {
        logger.error(`[Brevo Email] Failed to send "${title}" to ${user.email}: ${err.message}`);
        result.email = { ok: false, error: err.message };
      }
    } else {
      result.email = { ok: false, error: !user.email ? "no_email" : "no_template" };
    }

    // Consolidated per-user notification log
    logger.info(
      `[Notify] user=${user._id || user.email} title="${title}" email=${result.email.ok} sms=${result.sms.ok} push=${result.push.ok}`
    );
  } catch (err) {
    logger.error(`notifyUser failed for ${user._id || user.email}: ${err.message}`);
  }
  return result;
}

async function fetchStudentsForAssignmentOrQuiz(item) {
  const userIds = item.assigned_to_users || [];
  const grades = item.assigned_to_grades || [];
  const otherGrades = item.assigned_to_other_grades || [];
  const schools = item.assigned_to_schools || [];

  return User.find({
    role: "student",
    $or: [
      { _id: { $in: userIds } },
      { grade: { $in: grades } },
      { _id: { $in: otherGrades } },
      { school: { $in: schools } },
    ],
  }).select("_id phone email firstname PushSub");
}

// === Assignment Events ===
eventBus.on("assignment_created", async ({ assignmentId, title }) => {
  try {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return;

    const effectiveTitle = title || assignment.title || "New Assignment";

    const students = await fetchStudentsForAssignmentOrQuiz(assignment);
    let emailOk = 0, emailFail = 0, smsOk = 0, smsFail = 0, pushOk = 0, pushFail = 0;
    for (const student of students) {
      const r = await notifyUser(
        student,
        "New Assignment",
        `"${effectiveTitle}" is due on ${assignment.due_date?.toDateString?.() || ""}`,
        "/student/assignments",
        EMAIL_TEMPLATES.assignmentNotification,
        {
          firstname: student.firstname,
          assignmentTitle: effectiveTitle,
          dueDate: assignment.due_date?.toDateString?.() || "",
        }
      );
      if (r.email?.ok) emailOk++; else emailFail++;
      if (r.sms?.ok) smsOk++; else smsFail++;
      if (r.push?.ok) pushOk++; else pushFail++;
    }
    logger.info(`[EventBus] assignment_created assignmentId=${assignmentId} notifiedStudents=${students.length} email_ok=${emailOk}/${students.length} sms_ok=${smsOk}/${students.length} push_ok=${pushOk}/${students.length}`);

    // Schedule reminders
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
        EMAIL_TEMPLATES.assignmentNotification,
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
// ===== Task Events =====
eventBus.on("task_created", async ({ taskId, studentId, title }) => {
  try {
    const task = await StudentTask.findById(taskId);
    const student = await User.findById(studentId).select("_id phone email firstname PushSub");
    if (!task || !student) return;

    await notifyUser(
      student,
      "Task Created",
      `Your task "${title}" is set for ${task.due_date.toDateString()}`,
      "/student/tasks"
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
      "/student/tasks"
    );
  } catch (err) {
    logger.error(`task_reminder job failed: ${err.message}`);
  }
});

// Define an Agenda job to auto-submit individual quiz submissions when time runs out
agenda.define("auto_submit_quiz", async (job) => {
  const { quizId, studentId } = job.attrs.data;
  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return;
    const submission = quiz.submissions.find(s => String(s.student_id) === String(studentId));
    if (!submission || submission.submitted_at) return; // already submitted

    let score = 0;
    quiz.questions.forEach((q, idx) => {
      if (submission.answers[idx] === q.correct) score++;
    });
    submission.score = score;
    submission.submitted_at = new Date();
    submission.auto_submitted = true;
    await quiz.save();

    eventBus.emit("quiz_auto_submitted", { quizId: quiz._id, studentId, score });
  } catch (err) {
    logger.error(`auto_submit_quiz job failed: ${err.message}`);
  }
});

// ===== Quiz Events =====
eventBus.on("quiz_created", async ({ quizId, title }) => {
  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return;

    const effectiveTitle = title || quiz.title || "New Quiz";
    const students = await fetchStudentsForAssignmentOrQuiz(quiz);

    let emailOk = 0, emailFail = 0, pushOk = 0, pushFail = 0, smsOk = 0, smsFail = 0;
    for (const student of students) {
      const r = await notifyUser(
        student,
        "New Quiz",
        `"${effectiveTitle}" is now available!`,
        "/student/quizzes",
        EMAIL_TEMPLATES.quizNotification,
        { firstname: student.firstname, quizTitle: effectiveTitle }
      );
      if (r.email?.ok) emailOk++; else emailFail++;
      if (r.push?.ok) pushOk++; else pushFail++;
      if (r.sms?.ok) smsOk++; else smsFail++;
    }
    logger.info(`[EventBus] quiz_created quizId=${quizId} notifiedStudents=${students.length} email_ok=${emailOk}/${students.length} sms_ok=${smsOk}/${students.length} push_ok=${pushOk}/${students.length}`);

    // Optional reminders based on due_date
    if (quiz.due_date) {
      const reminderHours = [6, 2];
      for (const hoursBefore of reminderHours) {
        const remindTime = new Date(quiz.due_date);
        remindTime.setHours(remindTime.getHours() - hoursBefore);
        if (remindTime > new Date()) {
          await agenda.schedule(remindTime, "quiz_reminder", { quizId, hoursBefore });
        }
      }
    }
  } catch (err) {
    logger.error(`quiz_created event failed: ${err.message}`);
  }
});

// Agenda job: send quiz reminders
agenda.define("quiz_reminder", async (job) => {
  const { quizId, hoursBefore } = job.attrs.data;
  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return;
    const students = await fetchStudentsForAssignmentOrQuiz(quiz);

    for (const student of students) {
      await notifyUser(
        student,
        "Quiz Reminder",
        `"${quiz.title}" is due in ${hoursBefore} hours.`,
        "/student/quizzes",
        EMAIL_TEMPLATES.quizNotification,
        { firstname: student.firstname, quizTitle: quiz.title, hoursBefore }
      );
    }
  } catch (err) {
    logger.error(`quiz_reminder job failed: ${err.message}`);
  }
});

// ===== Feedback & Grades =====
eventBus.on("feedback_given", async ({ assignmentId, studentId, feedback }) => {
  try {
    const assignment = await Assignment.findById(assignmentId);
    const student = await User.findById(studentId).select("_id phone email firstname PushSub");
    if (!assignment || !student) return;

    await notifyUser(
      student,
      "Feedback Received",
      `You received feedback for "${assignment.title}"`,
      "/student/assignments",
      EMAIL_TEMPLATES.feedbackReceived,
      {
        firstname: student.firstname,
        assignmentTitle: assignment.title,
        feedback,
      }
    );
  } catch (err) {
    logger.error(`feedback_given event failed: ${err.message}`);
  }
});

eventBus.on("assignment_graded", async ({ assignmentId, studentId, grade }) => {
  try {
    const assignment = await Assignment.findById(assignmentId);
    const student = await User.findById(studentId).select("_id phone email firstname PushSub");
    if (!assignment || !student) return;

    await notifyUser(
      student,
      "Assignment Graded",
      `Your grade: ${grade}`,
      "/student/assignments",
      EMAIL_TEMPLATES.gradedAssignment,
      {
        firstname: student.firstname,
        assignmentTitle: assignment.title,
        grade,
      }
    );
  } catch (err) {
    logger.error(`assignment_graded event failed: ${err.message}`);
  }
});

// ===== Rewards, Goals, Budgets =====
eventBus.on("reward_granted", async ({ userId, type, points, reason }) => {
  try {
    const user = await User.findById(userId).select("_id phone email firstname PushSub");
    if (!user) return;

    const message = points
      ? `You just earned ${points} points! ${reason ? `Reason: ${reason}` : ""}`
      : `You just earned the "${type}" reward!`;

    await notifyUser(
      user,
      "Reward Update",
      message,
      "/student/rewards",
      EMAIL_TEMPLATES.rewardNotification,
      { firstname: user.firstname, rewardType: type, points, reason }
    );
  } catch (err) {
    logger.error(`reward_granted event failed: ${err.message}`);
  }
});

// Backwards-compatible listener for reward_notification emitted by worker rewards route
eventBus.on("reward_notification", async ({ userId, message }) => {
  try {
    const user = await User.findById(userId).select("_id phone email firstname PushSub");
    if (!user) return;
    await notifyUser(user, "Reward Update", message, "/worker/rewards");
  } catch (err) {
    logger.error(`reward_notification handler failed: ${err.message}`);
  }
});

eventBus.on("goal_notification", async ({ userId, message }) => {
  try {
    const user = await User.findById(userId).select("_id phone email firstname PushSub");
    if (!user) return;

    await notifyUser(
      user,
      "Goal Update",
      message,
      "/student/goals",
      EMAIL_TEMPLATES.goalBudgetUpdate,
      { firstname: user.firstname, message }
    );
  } catch (err) {
    logger.error(`goal_notification event failed: ${err.message}`);
  }
});

eventBus.on("budget_notification", async ({ userId, message }) => {
  try {
    const user = await User.findById(userId).select("_id phone email firstname PushSub");
    if (!user) return;

    await notifyUser(
      user,
      "Budget Update",
      message,
      "/student/budget",
      EMAIL_TEMPLATES.goalBudgetUpdate,
      { firstname: user.firstname, message }
    );
  } catch (err) {
    logger.error(`budget_notification event failed: ${err.message}`);
  }
});

// ===== Worker Events =====
eventBus.on("worker_transaction_added", async ({ workerId, transaction }) => {
  try {
    const worker = await User.findById(workerId).select("_id phone email firstname PushSub");
    if (!worker) return;
    await notifyUser(
      worker,
      "Transaction Added",
      `A transaction of ${transaction.amount} (${transaction.type}) was added.`,
      "/worker/overview"
    );
  } catch (err) {
    logger.error(`worker_transaction_added handler failed: ${err.message}`);
  }
});

eventBus.on("worker_goal_added", async ({ workerId, goal }) => {
  try {
    const worker = await User.findById(workerId).select("_id phone email firstname PushSub");
    if (!worker) return;
    await notifyUser(
      worker,
      "New Goal Added",
      `Your goal "${goal.title}" has been saved.`,
      "/worker/goals"
    );
  } catch (err) {
    logger.error(`worker_goal_added handler failed: ${err.message}`);
  }
});

eventBus.on("worker_progress_updated", async ({ workerId, updates }) => {
  try {
    const worker = await User.findById(workerId).select("_id phone email firstname PushSub");
    if (!worker) return;
    await notifyUser(
      worker,
      "Progress Update",
      `Your progress was updated.`,
      "/worker/overview"
    );
  } catch (err) {
    logger.error(`worker_progress_updated handler failed: ${err.message}`);
  }
});

// Agenda job to notify worker about reminders
agenda.define("worker_reminder", async (job) => {
  const { workerId, title, due_date } = job.attrs.data;
  try {
    const worker = await User.findById(workerId).select("_id phone email firstname PushSub");
    if (!worker) return;
    await notifyUser(
      worker,
      "Reminder",
      `Reminder: ${title} is due on ${new Date(due_date).toLocaleString()}`,
      "/worker/reminders",
      EMAIL_TEMPLATES.assignmentNotification,
      { firstname: worker.firstname, reminderTitle: title, dueDate: new Date(due_date).toDateString() }
    );
  } catch (err) {
    logger.error(`worker_reminder job failed: ${err.message}`);
  }
});

// Notify teacher/student when a quiz is submitted
eventBus.on("quiz_submitted", async ({ quizId, studentId, score }) => {
  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return;
    const teacher = await User.findById(quiz.teacher_id).select("_id phone email firstname PushSub");
    const student = await User.findById(studentId).select("_id firstname lastname email PushSub");
    if (!teacher || !student) return;

    const message = `${student.firstname} ${student.lastname} submitted ${quiz.title} - Score: ${score}/${quiz.questions.length}`;
    await notifyUser(
      teacher,
      "Quiz Submitted",
      message,
      `/quiz_dashboard.html?quizId=${quizId}`,
      emailTemplates.quizNotification,
      { firstname: teacher.firstname, studentName: `${student.firstname} ${student.lastname}`, quizTitle: quiz.title, score }
    );
  } catch (err) {
    logger.error(`quiz_submitted handler failed: ${err.message}`);
  }
});

// Notify teacher when a quiz was auto-submitted
eventBus.on("quiz_auto_submitted", async ({ quizId, studentId, score }) => {
  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return;
    const teacher = await User.findById(quiz.teacher_id).select("_id phone email firstname PushSub");
    const student = await User.findById(studentId).select("_id firstname lastname email PushSub");
    if (!teacher || !student) return;

    const message = `${student.firstname} ${student.lastname}'s time expired for ${quiz.title}. Auto-submitted - Score: ${score}/${quiz.questions.length}`;
    await notifyUser(
      teacher,
      "Quiz Auto-Submitted",
      message,
      `/quiz_dashboard.html?quizId=${quizId}`,
      emailTemplates.quizNotification,
      { firstname: teacher.firstname, studentName: `${student.firstname} ${student.lastname}`, quizTitle: quiz.title, score }
    );
  } catch (err) {
    logger.error(`quiz_auto_submitted handler failed: ${err.message}`);
  }
});

// Notify student when teacher sends them a message
eventBus.on("teacher_message", async ({ userId, message, teacherName }) => {
  try {
    const student = await User.findById(userId).select("_id phone email firstname PushSub");
    if (!student) return;

    await notifyUser(
      student,
      `Message from ${teacherName}`,
      message,
      "/student/messages"
    );
  } catch (err) {
    logger.error(`teacher_message handler failed: ${err.message}`);
  }
});

// Notify teacher/student when a new assignment submission is created
eventBus.on("new_submission", async ({ assignmentId, studentId, title }) => {
  try {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return;
    const teacher = await User.findById(assignment.teacher_id).select("_id phone email firstname lastname email PushSub");
    const student = await User.findById(studentId).select("_id firstname lastname email PushSub");
    if (!teacher || !student) return;

    const aTitle = title || assignment.title || "an assignment";
    const submittedAt = new Date().toLocaleString();

    const teacherRes = await notifyUser(
      teacher,
      "New Submission",
      `${student.firstname} ${student.lastname} submitted ${aTitle}`,
      "/teacher/feedback",
      EMAIL_TEMPLATES.assignmentSubmittedTeacher,
      {
        teacherName: `${teacher.firstname || ""} ${teacher.lastname || ""}`.trim(),
        studentName: `${student.firstname} ${student.lastname}`,
        assignmentTitle: aTitle,
        submittedAt,
        reviewLink: `${process.env.APP_BASE_URL || ""}/teacher/feedback`
      }
    );

    const studentRes = await notifyUser(
      student,
      "Submission Received",
      `Your submission for ${aTitle} was received.`,
      "/student/submissions",
      EMAIL_TEMPLATES.assignmentSubmittedStudent,
      {
        firstname: student.firstname,
        assignmentTitle: aTitle,
        submittedAt,
        dashboardLink: `${process.env.APP_BASE_URL || ""}/student/submissions`
      }
    );

    logger.info(`[EventBus] new_submission assignmentId=${assignmentId} teacherEmail=${teacherRes.email.ok} studentEmail=${studentRes.email.ok}`);
  } catch (err) {
    logger.error(`new_submission handler failed: ${err.message}`);
  }
});


eventBus.setMaxListeners(50);

export default eventBus;
export { agenda };


