// utils/email.js
const Brevo = require("@getbrevo/brevo");
const nodemailer = require("nodemailer");

// ─── Brevo API Client ───
const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

// ─── SMTP Transporter (Brevo Relay Fallback) ───
const smtpTransporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  secure: false,
  tls: { rejectUnauthorized: false },
});

// ─── Template IDs Mapping (Brevo) ───
const TEMPLATE_IDS = {
  WELCOME: 2,
  OTP: 3,
  RESET: 4,
  QUIZ_NOTIFICATION: 5,
  ASSIGNMENT_NOTIFICATION: 6,
  FEEDBACK_RECEIVED: 7,
  GRADED_ASSIGNMENT: 8,
  REWARD_NOTIFICATION: 9,
  GOAL_BUDGET_UPDATE: 10,
  PAYMENT_RECEIPT: 11,
  SUBSCRIPTION_RENEWAL: 12,
};

/**
 * Delay helper (exponential backoff)
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Primary send via Brevo API
 */
async function tryBrevoAPI(toEmail, templateId, params) {
  await apiInstance.sendTransacEmail({
    templateId,
    to: [{ email: toEmail }],
    params,
  });
  console.log(
    `✅ Email sent via Brevo API to ${toEmail} (template ${templateId})`
  );
}

/**
 * Fallback send via Brevo SMTP relay
 */
async function trySMTP(toEmail, templateId, params) {
  const subject = "SmartStudentAct Notification";
  const html = `
    <p>Hello,</p>
    <p>This is a fallback email for template <b>${templateId}</b>.</p>
    <pre>${JSON.stringify(params, null, 2)}</pre>
  `;

  await smtpTransporter.sendMail({
    from: `"SmartStudentAct" <${process.env.MAIL_USER}>`,
    to: toEmail,
    subject,
    html,
  });
  console.log(`✅ Email sent via SMTP fallback to ${toEmail}`);
}

/**
 * Send email with retries + fallback
 */
async function sendTemplateEmail(toEmail, templateId, params = {}) {
  if (!toEmail || !templateId) {
    console.warn("[Email] Skipped – missing email or templateId");
    return false;
  }

  const maxAttempts = 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      attempt++;
      await tryBrevoAPI(toEmail, templateId, params);
      return true; // ✅ success
    } catch (apiError) {
      console.error(
        `⚠️ Brevo API failed (attempt ${attempt}) for ${toEmail}:`,
        apiError.response?.body || apiError.message
      );

      if (attempt === maxAttempts) {
        try {
          await trySMTP(toEmail, templateId, params);
          return true;
        } catch (smtpError) {
          console.error(
            `❌ SMTP fallback failed for ${toEmail}:`,
            smtpError.message
          );
          return false;
        }
      }

      const delay = Math.pow(2, attempt) * 1000; // 2s → 4s → 8s
      console.log(`⏳ Retrying in ${delay / 1000}s...`);
      await wait(delay);
    }
  }

  return false;
}

/* ─── Convenience Wrappers ─── */

// Auth & Onboarding
const sendOTPEmail = (email, otpCode) =>
  sendTemplateEmail(email, TEMPLATE_IDS.OTP, { OTP_CODE: otpCode });

const sendWelcomeEmail = (email, firstname) =>
  sendTemplateEmail(email, TEMPLATE_IDS.WELCOME, { FIRSTNAME: firstname });

const sendResetEmail = (email, resetLink) =>
  sendTemplateEmail(email, TEMPLATE_IDS.RESET, { RESET_LINK: resetLink });

// Academic
const sendQuizNotificationEmail = (email, firstname, quizTitle, dueDate, link) =>
  sendTemplateEmail(email, TEMPLATE_IDS.QUIZ_NOTIFICATION, {
    FIRSTNAME: firstname,
    QUIZ_TITLE: quizTitle,
    DUE_DATE: dueDate,
    LINK: link,
  });

const sendAssignmentNotificationEmail = (
  email,
  firstname,
  assignmentTitle,
  dueDate,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.ASSIGNMENT_NOTIFICATION, {
    FIRSTNAME: firstname,
    ASSIGNMENT_TITLE: assignmentTitle,
    DUE_DATE: dueDate,
    LINK: link,
  });

const sendFeedbackNotificationEmail = (
  email,
  firstname,
  feedbackMessage,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.FEEDBACK_RECEIVED, {
    FIRSTNAME: firstname,
    FEEDBACK_MESSAGE: feedbackMessage,
    LINK: link,
  });

const sendAssignmentGradedEmail = (
  email,
  firstname,
  assignmentTitle,
  grade,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.GRADED_ASSIGNMENT, {
    FIRSTNAME: firstname,
    ASSIGNMENT_TITLE: assignmentTitle,
    GRADE: grade,
    LINK: link,
  });

// Rewards & Finance
const sendRewardEarnedEmail = (email, firstname, rewardType, link) =>
  sendTemplateEmail(email, TEMPLATE_IDS.REWARD_NOTIFICATION, {
    FIRSTNAME: firstname,
    REWARD_TYPE: rewardType,
    LINK: link,
  });

const sendGoalBudgetUpdateEmail = (email, firstname, message, link) =>
  sendTemplateEmail(email, TEMPLATE_IDS.GOAL_BUDGET_UPDATE, {
    FIRSTNAME: firstname,
    MESSAGE: message,
    LINK: link,
  });

// Finance – new templates
const sendPaymentReceiptEmail = (
  email,
  firstname,
  planName,
  amount,
  date,
  transactionId,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.PAYMENT_RECEIPT, {
    FIRSTNAME: firstname,
    PLAN_NAME: planName,
    AMOUNT: amount,
    DATE: date,
    TRANSACTION_ID: transactionId,
    LINK: link,
  });

const sendSubscriptionRenewalEmail = (
  email,
  firstname,
  planName,
  amount,
  nextBillingDate,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.SUBSCRIPTION_RENEWAL, {
    FIRSTNAME: firstname,
    PLAN_NAME: planName,
    AMOUNT: amount,
    NEXT_BILLING_DATE: nextBillingDate,
    LINK: link,
  });

/* ─── Exports ─── */
module.exports = {
  sendTemplateEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendResetEmail,
  sendQuizNotificationEmail,
  sendAssignmentNotificationEmail,
  sendFeedbackNotificationEmail,
  sendAssignmentGradedEmail,
  sendRewardEarnedEmail,
  sendGoalBudgetUpdateEmail,
  sendPaymentReceiptEmail,
  sendSubscriptionRenewalEmail,
  TEMPLATE_IDS,
};

