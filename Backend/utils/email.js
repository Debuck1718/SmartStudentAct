const Brevo = require("@getbrevo/brevo");

// Initialize Brevo client
const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

// Template IDs mapping
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
 * Send email using a Brevo template with dynamic params
 * @param {string} toEmail - Recipient email
 * @param {number} templateId - Brevo template ID
 * @param {object} params - Template variables {KEY: VALUE}
 */
async function sendTemplateEmail(toEmail, templateId, params = {}) {
  if (!toEmail || !templateId) {
    console.warn("[Email] Skipped – missing email or templateId");
    return;
  }

  try {
    await apiInstance.sendTransacEmail({
      templateId,
      to: [{ email: toEmail }],
      params,
    });
    console.log(`✅ Email sent to ${toEmail} using template ${templateId}`);
  } catch (error) {
    console.error(
      `❌ Failed to send email to ${toEmail}:`,
      error.response?.body || error.message || error
    );
  }
}

/* Convenience wrappers for legacy calls */
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


