const EventEmitter = require("events");
const webpush = require("web-push");
const smsApi = require("./sms");
const logger = require("./logger");
const mailer = require("./email");

const eventBus = new EventEmitter();

// Email template IDs
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

// Web push setup
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
    logger.info(`[SMS] Sent to ${recipient}: ${message}`);
  } catch (err) {
    logger.error(`[SMS] Failed to send to ${recipient}: ${err.message}`);
  }
}

async function sendPush(pushSub, payload) {
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
    if (user.PushSub) await sendPush(user.PushSub, { title, body: message, url });
    if (user.phone) await sendSMS(user.phone, `${title}: ${message}`);
    if (user.email && emailTemplateId) await mailer.sendTemplateEmail(user.email, emailTemplateId, templateVariables);
    logger.info(`Notification sent to user ${user._id}: ${title}`);
  } catch (err) {
    logger.error(`notifyUser failed for ${user._id}: ${err.message}`);
  }
}

module.exports = { eventBus, notifyUser, emailTemplates };

