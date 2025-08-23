// testBrevo.js
require("dotenv").config();
const { sendOTPEmail, sendWelcomeEmail, sendResetEmail } = require("./utils/email");

(async () => {
  try {
    // Test OTP Email
    await sendOTPEmail("abdulaiadinani6@gmail.com", "123456");

    // Test Welcome Email
    await sendWelcomeEmail("abdulaiadinani6@gmail.com", "Abdulai");

    // Test Reset Email
    await sendResetEmail("abdulaiadinani6@gmail.com", "https://smartstudentact.com/reset/abc123");

    console.log("✅ All test emails attempted!");
  } catch (err) {
    console.error("❌ Test failed:", err.message);
  }
})();
