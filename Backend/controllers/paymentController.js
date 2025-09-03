// controllers/paymentController.js
const { getUserPrice } = require("../services/pricingService");
const { initPaystackPayment } = require("../services/paystackService");
const { initFlutterwavePayment } = require("../services/flutterwaveService");
const { validatePaymentRequest } = require("../utils/validator");
const { handleWebhook } = require("./webhookController");
const logger = require("../utils/logger"); // make sure you have a logger util

async function initializePayment(req, res) {
  try {
    // ✅ Validate request schema
    const { error } = validatePaymentRequest(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { gateway, paymentMethod } = req.body;
    const user = req.fullUser || req.user;

    if (!user || !user.email) {
      return res.status(400).json({ success: false, message: "User information missing." });
    }

    const schoolName = user.schoolName || "";
    const schoolCountry = user.schoolCountry || "";
    const userRole = user.occupation || user.role || "student";

    // ✅ Fetch pricing
    const priceInfo = await getUserPrice(user, userRole, schoolName, schoolCountry);

    if (!priceInfo || typeof priceInfo.localPrice !== "number" || !priceInfo.currency) {
      return res.status(400).json({ success: false, message: "Pricing not available for this user." });
    }

    const amount = priceInfo.localPrice;
    const currency = priceInfo.currency;

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid payment amount." });
    }

    const selectedGateway = gateway || paymentMethod || "paystack";
    let paymentData;

    logger.info(
      `User ${user.email} is initiating payment via ${selectedGateway} for ${amount} ${currency}`
    );

    switch (selectedGateway) {
      case "flutterwave":
        try {
          paymentData = await initFlutterwavePayment({ email: user.email, amount, currency });
        } catch (err) {
          logger.error("Flutterwave error:", err.response?.data || err.message);
          return res.status(400).json({
            success: false,
            error: "Flutterwave error",
            details: err.response?.data || err.message,
          });
        }
        break;

      case "paystack":
        try {
          paymentData = await initPaystackPayment({ email: user.email, amount, currency });
        } catch (err) {
          logger.error("Paystack error:", err.response?.data || err.message);
          return res.status(400).json({
            success: false,
            error: "Paystack error",
            details: err.response?.data || err.message,
          });
        }
        break;

      default:
        return res.status(400).json({ success: false, message: "Unsupported payment gateway." });
    }

    return res.json({
      success: true,
      message: "Payment initiated successfully.",
      gateway: selectedGateway,
      data: paymentData,
    });
  } catch (err) {
    logger.error("Unexpected error in initializePayment:", err);
    return res.status(500).json({ success: false, error: "Failed to initiate payment.", details: err.message });
  }
}

// ✅ Webhook handlers
const handlePaystackWebhook = (req, res) => handleWebhook(req, res, "paystack");
const handleFlutterwaveWebhook = (req, res) => handleWebhook(req, res, "flutterwave");

module.exports = {
  initializePayment,
  handlePaystackWebhook,
  handleFlutterwaveWebhook,
};
