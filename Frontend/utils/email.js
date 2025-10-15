const Brevo = require('@getbrevo/brevo');
const nodemailer = require('nodemailer');

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

const smtpTransporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT || 587,
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  secure: false,
  tls: { rejectUnauthorized: false }
});

async function sendTemplateEmail(toEmail, templateId, params = {}) {
  if (!toEmail || !templateId) return false;

  try {
    await apiInstance.sendTransacEmail({ templateId, to: [{ email: toEmail }], params });
    console.log(`Email sent via Brevo API → ${toEmail}`);
    return true;
  } catch (err) {
    console.error("Brevo API failed, fallback to SMTP:", err.message);
    const subject = "SmartStudentAct Notification";
    const html = `<pre>${JSON.stringify(params, null, 2)}</pre>`;
    try {
      await smtpTransporter.sendMail({ from: process.env.MAIL_USER, to: toEmail, subject, html });
      return true;
    } catch (smtpErr) {
      console.error("SMTP fallback failed:", smtpErr.message);
      return false;
    }
  }
}

module.exports = { sendTemplateEmail };
