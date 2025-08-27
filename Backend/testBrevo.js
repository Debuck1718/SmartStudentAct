// testBrevo.js
require("dotenv").config();
const { sendOTPEmail, sendWelcomeEmail, sendResetEmail } = require("./utils/email");

(async () => {
  try {
    console.log("🚀 Starting Brevo email test...");

    // Test OTP Email
    console.log("📩 Testing OTP Email...");
    await sendOTPEmail("evans.buckman55@gmail.com", "123456");

    // Test Welcome Email
    console.log("📩 Testing Welcome Email...");
    await sendWelcomeEmail("evans.buckman55@gmail.com", "Global");

    // Test Reset Email
    console.log("📩 Testing Reset Email...");
    await sendResetEmail("evans.buckman55@gmail.com", "https://smartstudentact.com/reset/abc123");

    console.log("✅ All test emails attempted!");
  } catch (err) {
    console.error("❌ Test failed:", err);
  }
})();

