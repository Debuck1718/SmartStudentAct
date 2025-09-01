// controllers/paymentController.js
const { getPaymentDetails } = require('../services/pricingService');
const { initPaystackPayment } = require('../services/paystackService');
const { initFlutterwavePayment } = require('../services/flutterwaveService');
const { validatePaymentRequest } = require('../utils/validator'); 
const { handleWebhook } = require('./webhookController');

async function initializePayment(req, res) {
  try {
   
    const { error } = validatePaymentRequest(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { paymentMethod, phoneNumber } = req.body;
    const user = req.user; 
    if (!user || !user.email) {
      return res.status(400).json({ success: false, message: "User information missing." });
    }

    const schoolName = user.schoolName || '';
    const userRole = user.occupation || user.role || 'student';

    const paymentDetails = await getPaymentDetails({
      user,
      role: userRole,
      schoolName,
      paymentMethod
    });

    if (!paymentDetails || typeof paymentDetails.amount !== 'number' || !paymentDetails.currency) {
      return res.status(400).json({ success: false, message: "Pricing not available for this user." });
    }

    const { amount, currency, gateway } = paymentDetails;

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid payment amount." });
    }

    let paymentResponse;
    if (gateway === 'paystack') {
      paymentResponse = await initPaystackPayment({ email: user.email, amount, currency, phoneNumber });
    } else if (gateway === 'flutterwave') {
      paymentResponse = await initFlutterwavePayment({ email: user.email, amount, currency, phoneNumber });
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported payment gateway.' });
    }

    res.json({ success: true, paymentData: paymentResponse });
  } catch (err) {
    console.error('Payment initialization error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}


const handlePaystackWebhook = (req, res) => handleWebhook(req, res, 'paystack');
const handleFlutterwaveWebhook = (req, res) => handleWebhook(req, res, 'flutterwave');

module.exports = {
  initializePayment,
  handlePaystackWebhook,
  handleFlutterwaveWebhook
};
