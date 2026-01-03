import Brevo from "@getbrevo/brevo";
import nodemailer from "nodemailer";

// --- Brevo setup ---
const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

// --- SMTP fallback setup ---
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

// --- Template IDs ---
export const TEMPLATE_IDS = {
  welcome: 2,
  otp: 3,
  reset: 4,
  quizNotification: 5,
  assignmentNotification: 6,
  feedbackReceived: 7,
  gradedAssignment: 8,
  rewardNotification: 9,
  goalBudgetUpdate: 10,
  paymentReceipt: 11,
  subscriptionRenewal: 12,
  specialLink: 13,
  assignmentSubmittedStudent: 14,
  assignmentSubmittedTeacher: 15, 
};


function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Brevo sending ---
async function tryBrevoAPI(toEmail, templateId, params) {
  await apiInstance.sendTransacEmail({
    templateId,
    to: [{ email: toEmail }],
    params,
  });
  console.log(`📧 Email sent via Brevo API to ${toEmail} (template ${templateId})`);
}

// --- SMTP fallback ---
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

  console.log(`📨 Email sent via SMTP fallback to ${toEmail}`);
}

// --- Main template sender ---
export async function sendTemplateEmail(toEmail, templateId, params = {}) {
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
      return true;
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
          console.error(`❌ SMTP fallback failed for ${toEmail}:`, smtpError.message);
          return false;
        }
      }

      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Retrying in ${delay / 1000}s...`);
      await wait(delay);
    }
  }

  return false;
}

// --- Template-specific helpers ---
export const sendOTPEmail = (email, firstname, otp) =>
  sendTemplateEmail(email, TEMPLATE_IDS.otp, { firstname, otp });

export const sendWelcomeEmail = (email, firstname) =>
  sendTemplateEmail(email, TEMPLATE_IDS.welcome, { firstname });

export const sendResetEmail = (email, resetLink) =>
  sendTemplateEmail(email, TEMPLATE_IDS.reset, { reset_link: resetLink });

export const sendQuizNotificationEmail = (email, firstname, quizTitle, dueDate, link) =>
  sendTemplateEmail(email, TEMPLATE_IDS.quizNotification, {
    firstname,
    quiz_title: quizTitle,
    due_date: dueDate,
    link,
  });

export const sendAssignmentNotificationEmail = (
  email,
  firstname,
  assignmentTitle,
  dueDate,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.assignmentNotification, {
    firstname,
    assignment_title: assignmentTitle,
    due_date: dueDate,
    link,
  });

export const sendFeedbackNotificationEmail = (
  email,
  firstname,
  feedbackMessage,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.feedbackReceived, {
    firstname,
    feedback_message: feedbackMessage,
    link,
  });

export const sendAssignmentGradedEmail = (
  email,
  firstname,
  assignmentTitle,
  grade,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.gradedAssignment, {
    firstname,
    assignment_title: assignmentTitle,
    grade,
    link,
  });

export const sendRewardEarnedEmail = (email, firstname, rewardType, link) =>
  sendTemplateEmail(email, TEMPLATE_IDS.rewardNotification, {
    firstname,
    reward_type: rewardType,
    link,
  });

export const sendGoalBudgetUpdateEmail = (email, firstname, message, link) =>
  sendTemplateEmail(email, TEMPLATE_IDS.goalBudgetUpdate, {
    firstname,
    message,
    link,
  });

export const sendPaymentReceiptEmail = (
  email,
  firstname,
  planName,
  amount,
  date,
  transactionId,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.paymentReceipt, {
    firstname,
    plan_name: planName,
    amount,
    date,
    transaction_id: transactionId,
    link,
  });

export const sendSubscriptionRenewalEmail = (
  email,
  firstname,
  planName,
  amount,
  nextBillingDate,
  link
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.subscriptionRenewal, {
    firstname,
    plan_name: planName,
    amount,
    next_billing_date: nextBillingDate,
    link,
  });

  export const sendAssignmentSubmissionStudentEmail = (
  email,
  firstname,
  assignmentTitle,
  submittedAt,
  dashboardLink
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.assignmentSubmittedStudent, {
    firstname,
    assignmentTitle,
    submittedAt,
    dashboardLink,
  });

// Teacher notification (Template 15)
export const sendAssignmentSubmissionTeacherEmail = (
  email,
  teacherName,
  studentName,
  assignmentTitle,
  submittedAt,
  reviewLink
) =>
  sendTemplateEmail(email, TEMPLATE_IDS.assignmentSubmittedTeacher, {
    teacherName,
    studentName,
    assignmentTitle,
    submittedAt,
    reviewLink,
  });


// --- NEW: Special Link Request Email ---
export const sendSpecialLinkEmail = ({
  email,
  firstname,
  requesterRole,   // "student" | "teacher"
  actionLink,
}) =>
  sendTemplateEmail(email, TEMPLATE_IDS.specialLink, {
    firstname,
    requester_role:
      requesterRole === "teacher" ? "Teacher" : "Student",
    connection_type: "Special Connection",
    action_link: actionLink,
  });

// ✅ Default export (for import mailer from "./email.js")
export default {
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
  sendAssignmentSubmissionStudentEmail,
  sendAssignmentSubmissionTeacherEmail,
  sendSpecialLinkEmail,
};

