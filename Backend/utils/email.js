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

// ─── Template IDs Mapping ───
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
 * @param {string} toEmail - Recipient email
 * @param {number} templateId - Brevo template ID
 * @param {object} params - Template variables {KEY: VALUE}
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

      // Fallback only after final attempt
      if (attempt === maxAttempts) {
        try {
          await trySMTP(toEmail, templateId, params);
          return true; // ✅ success via SMTP
        } catch (smtpError) {
          console.error(
            `❌ SMTP fallback failed for ${toEmail}:`,
            smtpError.message
          );
          return false;
        }
      }

      // exponential backoff before retry
      const delay = Math.pow(2, attempt) * 1000; // 2s → 4s → 8s
      console.log(`⏳ Retrying in ${delay / 1000}s...`);
      await wait(delay);
    }
  }

  return false;
}

/* ─── Convenience Wrappers ─── */
const sendOTPEmail = (email, otpCode) =>
  sendTemplateEmail(email, TEMPLATE_IDS.OTP, { OTP_CODE: otpCode });

const sendWelcomeEmail = (email, username) =>
  sendTemplateEmail(email, TEMPLATE_IDS.WELCOME, { USERNAME: username });

const sendResetEmail = (email, resetLink) =>
  sendTemplateEmail(email, TEMPLATE_IDS.RESET, { RESET_LINK: resetLink });

module.exports = {
  sendTemplateEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendResetEmail,
  TEMPLATE_IDS,
};


