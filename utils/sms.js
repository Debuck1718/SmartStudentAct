// utils/sms.js
//------------------------------------------------------------
//  Brevo SMS helper
//  – Gracefully degrades if credentials are absent
//------------------------------------------------------------
const brevo = require('@getbrevo/brevo');

const BREVO_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER = process.env.BREVO_SMS_SENDER || 'SmartStudentAct';

// Initialise client only when creds exist
let smsApi = null;

if (BREVO_KEY) {
  const apiInstance = new brevo.TransactionalSMSApi();
  apiInstance.setApiKey(brevo.TransactionalSMSApiApiKeys.apiKey, BREVO_KEY);
  smsApi = apiInstance;
} else {
  console.warn('[SMS] Brevo API key missing – set BREVO_API_KEY');
}

/**
 * sendSMS(to, message) – returns a Promise (resolved in all cases)
 */
async function sendSMS(to, message = '') {
  if (!to || !message) {
    return Promise.resolve('[SMS] skipped – to/message missing');
  }

  // Ensure number starts with '+'
  const recipient = to.startsWith('+') ? to : `+${to}`;

  if (!smsApi) {
    console.log(`[SMS] dev-noop → ${recipient}: ${message}`);
    return Promise.resolve('[SMS] noop – Brevo not configured');
  }

  try {
    await smsApi.sendTransacSms({
      sender: BREVO_SENDER,
      recipient,
      content: message
    });
    console.log(`📲  SMS sent → ${recipient}`);
    return true;
  } catch (err) {
    console.error(`📲  SMS error to ${recipient}:`, err.message);
    return null; // don’t throw – keep app alive
  }
}

module.exports = { sendSMS };
