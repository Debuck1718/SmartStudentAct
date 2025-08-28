const EventEmitter = require('events');
const webpush = require('web-push');
const smsApi = require('./sms');
const logger = require('./logger');
const mailer = require('./email'); 

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

async function sendPushToUser(PushSub, payload) {
  try {
    if (PushSub?.subscription) {
      await webpush.sendNotification(PushSub.subscription, JSON.stringify(payload));
    }
  } catch (err) {
    logger.error(`Push notification failed: ${err.message}`);
  }
}


async function notifyUser(user, title, message, url, emailTemplateId, templateVariables = {}) {
  try {

    await sendPushToUser(user.PushSub, { title, body: message, url });

    await sendSMS(user.phone, `${title}: ${message}`);

    if (user.email && emailTemplateId) {
      await mailer.sendTemplateEmail(user.email, emailTemplateId, templateVariables);
      logger.info(`[Brevo Email] Sent "${title}" to ${user.email}`);
    }
  } catch (err) {
    logger.error(`notifyUser failed for ${user._id}: ${err.message}`);
  }
}


function configureEventBus(agenda, mongoose) {
  const User = mongoose.models.User;
  const Assignment = mongoose.models.Assignment;
  const PushSub = mongoose.models.PushSub;
  const Quiz = mongoose.models.Quiz;

  eventBus.on('assignment_created', async ({ assignmentId, title, creatorId }) => {
    try {
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) return;

      const students = await User.find({
        $or: [
          { schoolName: { $in: assignment.assigned_to_schools } },
          { grade: { $in: assignment.assigned_to_grades } },
          { email: { $in: assignment.assigned_to_users } },
        ],
      }).select('_id phone email firstname');

      for (const student of students) {
        await sendSMS(student.phone, `New Assignment: "${title}" is due on ${assignment.due_date.toDateString()}`);

        await mailer.sendTemplateEmail(student.email, emailTemplates.assignmentNotification, {
          firstname: student.firstname,
          assignmentTitle: title,
          dueDate: assignment.due_date.toDateString(),
        });
      }

      const reminderHours = [24, 6, 2];
      reminderHours.forEach(async (hoursBefore) => {
        const remindTime = new Date(assignment.due_date);
        remindTime.setHours(remindTime.getHours() - hoursBefore);
        if (remindTime > new Date()) {
          await agenda.schedule(remindTime, 'assignment_reminder', {
            assignmentId,
            hoursBefore,
          });
        }
      });
    } catch (err) {
      logger.error(`assignment_created event failed: ${err.message}`);
    }
  });

  agenda.define('assignment_reminder', async (job) => {
    const { assignmentId, hoursBefore } = job.attrs.data;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return;

    const students = await User.find({
      $or: [
        { schoolName: { $in: assignment.assigned_to_schools } },
        { grade: { $in: assignment.assigned_to_grades } },
        { email: { $in: assignment.assigned_to_users } },
      ],
    }).select('_id phone email firstname');

    for (const student of students) {
      const message = `Reminder: "${assignment.title}" is due in ${hoursBefore} hours`;
      await sendSMS(student.phone, message);
      await mailer.sendTemplateEmail(student.email, emailTemplates.assignmentNotification, {
        firstname: student.firstname,
        assignmentTitle: assignment.title,
        dueDate: assignment.due_date.toDateString(),
        hoursBefore,
      });
    }
  });

  
  eventBus.on('quiz_created', async ({ quizId, title }) => {
    try {
      const quiz = await Quiz.findById(quizId);
      if (!quiz) return;

      const students = await User.find({ email: { $in: quiz.assigned_to_users } }).select(
        '_id phone email firstname'
      );

      for (const student of students) {
        await sendSMS(student.phone, `New Quiz: "${title}" is now available!`);
        await mailer.sendTemplateEmail(student.email, emailTemplates.quizNotification, {
          firstname: student.firstname,
          quizTitle: title,
        });
      }
    } catch (err) {
      logger.error(`quiz_created event failed: ${err.message}`);
    }
  });


  eventBus.on('feedback_given', async ({ assignmentId, studentId, feedback }) => {
    try {
      const assignment = await Assignment.findById(assignmentId);
      const student = await User.findById(studentId);

      await notifyUser(student, 'Feedback Received', `You received feedback for "${assignment.title}"`, '/student/assignments', emailTemplates.feedbackReceived, {
        firstname: student.firstname,
        assignmentTitle: assignment.title,
        feedback,
      });
    } catch (err) {
      logger.error(`feedback_given event failed: ${err.message}`);
    }
  });


  eventBus.on('assignment_graded', async ({ assignmentId, studentId, grade }) => {
    try {
      const assignment = await Assignment.findById(assignmentId);
      const student = await User.findById(studentId);

      await notifyUser(student, 'Assignment Graded', `Your grade: ${grade}`, '/student/assignments', emailTemplates.gradedAssignment, {
        firstname: student.firstname,
        assignmentTitle: assignment.title,
        grade,
      });
    } catch (err) {
      logger.error(`assignment_graded event failed: ${err.message}`);
    }
  });


  eventBus.on('reward_granted', async ({ userId, type }) => {
    try {
      const user = await User.findById(userId);
      await notifyUser(user, 'Reward Earned', `You just earned the "${type}" reward!`, '/student/rewards', emailTemplates.rewardNotification, {
        firstname: user.firstname,
        rewardType: type,
      });
    } catch (err) {
      logger.error(`reward_granted event failed: ${err.message}`);
    }
  });

  /* ──────────── Goal/Budget Notification ──────────── */
  eventBus.on('goal_notification', async ({ userId, message }) => {
    try {
      const user = await User.findById(userId);
      await notifyUser(user, 'Goal Update', message, '/student/goals', emailTemplates.goalBudgetUpdate, {
        firstname: user.firstname,
        message,
      });
    } catch (err) {
      logger.error(`goal_notification event failed: ${err.message}`);
    }
  });

  eventBus.on('budget_notification', async ({ userId, message }) => {
    try {
      const user = await User.findById(userId);
      await notifyUser(user, 'Budget Update', message, '/student/budget', emailTemplates.goalBudgetUpdate, {
        firstname: user.firstname,
        message,
      });
    } catch (err) {
      logger.error(`budget_notification event failed: ${err.message}`);
    }
  });

  return { eventBus };
}

eventBus.setMaxListeners(50);
module.exports = { configureEventBus, emailTemplates };
