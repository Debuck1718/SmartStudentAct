import Brevo from "@getbrevo/brevo";

const BREVO_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER = process.env.BREVO_SMS_SENDER || "SmartStudentAct";

let smsApi = null;

if (BREVO_KEY) {
  try {
    const apiInstance = new Brevo.TransactionalSMSApi();
    apiInstance.setApiKey(Brevo.TransactionalSMSApiApiKeys.apiKey, BREVO_KEY);
    smsApi = apiInstance;
    console.log("[SMS] Brevo client initialized.");
  } catch (err) {
    console.error("[SMS] Failed to initialize Brevo client:", err.message);
  }
} else {
  console.warn("[SMS] BREVO_API_KEY is missing – SMS will be skipped.");
}

export async function sendSMS(to, message = "") {
  if (!to || !message) {
    console.log("[SMS] Skipped – missing recipient or message");
    return null;
  }

  const recipient = to.startsWith("+") ? to : `+${to}`;

  if (!smsApi) {
    console.log(`[SMS] noop → ${recipient}: ${message}`);
    return null;
  }

  try {
    const response = await smsApi.sendTransacSms({
      sender: BREVO_SENDER,
      recipient,
      content: message,
    });

    console.log(`📲 SMS sent → ${recipient}`, response);
    return response;
  } catch (err) {
    const errorData = err.response?.data || err;

    if (errorData.code === "not_enough_credits") {
      console.error(`📲 SMS failed → ${recipient}: Not enough credits`);
    } else if (errorData.code === "invalid_parameter") {
      console.error(`📲 SMS failed → ${recipient}: Invalid sender or parameter`);
    } else if (errorData.code === "not_found") {
      console.error(`📲 SMS failed → ${recipient}: Invalid route/method`);
    } else {
      console.error(`📲 SMS failed → ${recipient}:`, errorData);
    }

    return null;
  }
}

// ✅ Default export for compatibility with "import smsApi from './sms.js'"
export default {
  sendSMS,
};

