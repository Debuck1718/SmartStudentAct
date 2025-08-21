// In controllers/paymentController.js
const { getPaymentDetails } = require('../services/pricingService');
const { initPaystackPayment } = require('../services/paystackService');
const { initFlutterwavePayment } = require('../services/flutterwaveService');
const { validatePaymentRequest } = require('../utils/validator'); // New file for validation
const { handleWebhook } = require('./webhookController'); // A new controller for webhooks

async function initializePayment(req, res) {
  try {
    // 1. Validate the incoming request data. 🔐
    const { error } = validatePaymentRequest(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { countryCode, userType, schoolId, email, paymentMethod, phoneNumber } = req.body;

    // 2. Get all necessary details from a single pricing service call. ⚙️
    const { amount, currency, gateway } = await getPaymentDetails({
      countryCode,
      userType,
      schoolId,
      paymentMethod
    });

    let paymentResponse;
    // 3. The controller routes based on the service's decision. 🛣️
    if (gateway === 'paystack') {
      paymentResponse = await initPaystackPayment({ email, amount, currency, phoneNumber });
    } else if (gateway === 'flutterwave') {
      paymentResponse = await initFlutterwavePayment({ email, amount, currency, phoneNumber });
    } else {
      // This should ideally never be reached if pricingService is robust.
      return res.status(400).json({ success: false, message: 'Invalid payment details provided.' });
    }

    res.json({ success: true, paymentData: paymentResponse });
  } catch (err) {
    console.error('Payment initialization error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Separate webhook handling is essential for scalability and security.
// This is not a direct part of the user's checkout flow.
const handlePaystackWebhook = (req, res) => handleWebhook(req, res, 'paystack');
const handleFlutterwaveWebhook = (req, res) => handleWebhook(req, res, 'flutterwave');

module.exports = {
  initializePayment,
  handlePaystackWebhook,
  handleFlutterwaveWebhook
};