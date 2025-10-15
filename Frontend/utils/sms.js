const brevo = require('@getbrevo/brevo');

const BREVO_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER = process.env.BREVO_SMS_SENDER || 'SmartStudentAct';

let smsApi = null;
if (BREVO_KEY) {
  try {
    const apiInstance = new brevo.TransactionalSMSApi();
    apiInstance.setApiKey(brevo.TransactionalSMSApiApiKeys.apiKey, BREVO_KEY);
    smsApi = apiInstance;
  } catch (err) { console.error('Failed to init SMS client:', err.message); }
}

async function sendSMS(to, message) {
  if (!to || !message || !smsApi) return null;
  const recipient = to.startsWith('+') ? to : `+${to}`;
  try {
    return await smsApi.sendTransacSms({ sender: BREVO_SENDER, recipient, content: message });
  } catch (err) {
    console.error("SMS failed:", err.message);
    return null;
  }
}

module.exports = { sendSMS };
