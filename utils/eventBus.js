const EventEmitter = require('events');
const webpush = require('web-push');
const smsApi = require('./sms');
const logger = require('./logger');
const mailer = require('./mailer'); // 🆕 Import the mailer utility
const emailTemplates = require('./emailTemplate'); // 🆕 Import the email templates

const eventBus = new EventEmitter();

/* ──────────── Notification Helpers (moved to top-level) ──────────── */
async function sendSMS(phone, message) {
  if (!phone) return;
  const recipient = phone.startsWith('+') ? phone : `+${phone}`;
  try {
    await smsApi.sendTransacSms({
      sender: process.env.BREVO_SMS_SENDER || 'SmartStudentAct',
      recipient,
      content: message,
    });
    logger.info(`[Brevo SMS] Sent to ${recipient}: ${message}`);
  } catch (err) {
    logger.error(`[Brevo SMS] Failed to send to ${recipient}: ${err.message}`);
  }
}

/* ──────────── The new configuration function ──────────── */
function configureEventBus(agenda, mongoose) {
  // Mongoose models are now accessed here, inside the function
  const User = mongoose.models.User;
  const Assignment = mongoose.models.Assignment;
  const PushSub = mongoose.models.PushSub;

  async function sendPushToUser(userId, payload) {
    try {
      const sub = await PushSub.findOne({ user_id: userId });
      if (sub?.subscription) {
        await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
      }
    } catch (err) {
      logger.error(`Failed to send push notification to ${userId}: ${err.message}`);
    }
  }

  async function notifyUser(userId, title, message, url) {
    try {
      const user = await User.findById(userId).select('phone email');
      await sendPushToUser(userId, { title, body: message, url });
      await sendSMS(user?.phone, `${title}: ${message}`);
    } catch (err) {
      logger.error(`notifyUser failed for user ${userId}: ${err.message}`);
    }
  }

  /* ──────────── Agenda Job ──────────── */
  agenda.define('send assignment reminder', async (job) => {
    const { assignmentId, label, title } = job.attrs.data;
    try {
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) return;
      
      const students = await User.find({
        $or: [
          { schoolName: { $in: assignment.assigned_to_schools } },
          { grade: { $in: assignment.assigned_to_grades } },
          { email: { $in: assignment.assigned_to_users } },
        ],
      }).select('_id phone email');
  
      for (const student of students) {
        await sendPushToUser(student._id, {
          title: `Assignment Reminder`,
          body: `"${title}" is due in ${label}!`,
          url: '/student/assignments',
        });
        await sendSMS(student.phone, `Reminder: "${title}" is due in ${label}`);
        // 🆕 You could also send an email reminder here if desired
      }
    } catch (err) {
      logger.error(`Failed to send assignment reminder job: ${err.message}`);
    }
  });

  /* ──────────── Helper to Schedule Reminders ──────────── */
  async function scheduleReminder(assignmentId, dueDate, title, hoursBefore, label) {
    try {
      const remindTime = new Date(dueDate);
      remindTime.setHours(remindTime.getHours() - hoursBefore);

      if (remindTime <= new Date()) {
        logger.info(`Reminder time (${label}) for assignment "${title}" already passed.`);
        return;
      }
      
      await agenda.schedule(remindTime, 'send assignment reminder', {
        assignmentId,
        label,
        title,
      });
  
      logger.info(`Scheduled assignment reminder (${label}) for "${title}" at ${remindTime}`);
    } catch (err) {
      logger.error(`Failed to schedule reminder (${label}) for assignment "${title}": ${err.message}`);
    }
  }

  /* ──────────── Event Listeners ──────────── */
  eventBus.on('assignment_created', async ({ assignmentId, title, creatorId }) => {
    try {
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) return;
      
      const teacher = await User.findById(creatorId).select('phone');
      await sendSMS(teacher?.phone, `Assignment "${title}" created. Due: ${assignment.due_date}`);
      
      await scheduleReminder(assignmentId, assignment.due_date, title, 24, '24 hours');
      await scheduleReminder(assignmentId, assignment.due_date, title, 6, '6 hours');
      await scheduleReminder(assignmentId, assignment.due_date, title, 2, '2 hours');
    } catch (err) {
      logger.error(`Error in assignment_created event: ${err.message}`);
    }
  });

  // ✅ Renamed from 'new_submission' to match the router logic
  eventBus.on('assignment_submitted', async ({ assignmentId, studentId }) => {
    try {
      const assignment = await Assignment.findById(assignmentId);
      const student = await User.findById(studentId);
      const teacher = await User.findById(assignment.created_by);
      
      // Notify the teacher via push/SMS
      await notifyUser(
        teacher._id,
        'Assignment Submission',
        `${student.firstname} ${student.lastname} submitted "${assignment.title}"`,
        '/teacher/assignments'
      );

      // 🆕 Email the student to confirm their submission
      const viewUrl = `/student/assignments/${assignment._id}`;
      const submissionDate = new Date().toLocaleDateString('en-US');
      const studentEmailBody = emailTemplates.submissionConfirmation(
        student.firstname,
        assignment.title,
        submissionDate,
        viewUrl
      );
      await mailer.sendEmail(student.email, `Submission Confirmed: ${assignment.title}`, studentEmailBody);

    } catch (err) {
      logger.error(`Error in assignment_submitted event: ${err.message}`);
    }
  });

  eventBus.on('feedback_given', async ({ assignmentId, studentId, feedback }) => {
    try {
      const assignment = await Assignment.findById(assignmentId);
      const student = await User.findById(studentId);
      
      await notifyUser(
        studentId,
        'Feedback Received',
        `You received feedback for "${assignment.title}": ${feedback}`,
        '/student/assignments'
      );

      // 🆕 Email the student about the new feedback
      const viewUrl = `/student/assignments/${assignment._id}`;
      const emailBody = emailTemplates.feedbackReceived(
        student.firstname,
        assignment.title,
        viewUrl
      );
      await mailer.sendEmail(student.email, `New Feedback: ${assignment.title}`, emailBody);

    } catch (err) {
      logger.error(`Error in feedback_given event: ${err.message}`);
    }
  });

  // 🆕 New event listener for when an assignment is graded
  eventBus.on('assignment_graded', async ({ assignmentId, studentId, grade }) => {
    try {
      const assignment = await Assignment.findById(assignmentId);
      const student = await User.findById(studentId);

      await notifyUser(
        studentId,
        'Assignment Graded',
        `Your assignment "${assignment.title}" received a grade of ${grade}.`,
        '/student/assignments'
      );

      // 🆕 Email the student with their grade and a link to the feedback
      const viewUrl = `/student/assignments/${assignment._id}`;
      const emailBody = emailTemplates.gradedFeedback(
        student.firstname,
        assignment.title,
        grade,
        viewUrl
      );
      await mailer.sendEmail(student.email, `Assignment Graded: ${assignment.title}`, emailBody);

    } catch (err) {
      logger.error(`Error in assignment_graded event: ${err.message}`);
    }
  });


  eventBus.on('budget_notification', async ({ userId, message }) => {
    try {
      await notifyUser(userId, 'Budget Update', message, '/student/budget');
    } catch (err) {
      logger.error(`Error in budget_notification event: ${err.message}`);
    }
  });

  eventBus.on('goal_notification', async ({ userId, message }) => {
    try {
      await notifyUser(userId, 'Goal Update', message, '/student/goals');
    } catch (err) {
      logger.error(`Error in goal_notification event: ${err.message}`);
    }
  });

  eventBus.on('reward_granted', async ({ userId, type }) => {
    try {
      await notifyUser(
        userId,
        '🎁 Reward Earned!',
        `You just earned the "${type}" reward.`,
        '/student/rewards'
      );
    } catch (err) {
      logger.error(`Error in reward_granted event: ${err.message}`);
    }
  });

  return { eventBus, scheduleReminder, notifyUser };
}
eventBus.setMaxListeners(50);
module.exports = { configureEventBus };