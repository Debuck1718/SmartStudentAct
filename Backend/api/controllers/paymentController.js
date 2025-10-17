const { getUserPrice } = require("../../../Backend/api/services/pricingService");
const { initPaystackPayment } = require("../../../Backend/api/services/paystackService");
const { initFlutterwavePayment } = require("../../../Backend/api/services/flutterwaveService");
const { handleWebhook } = require("./webhookController");

async function initializePayment(req, res) {
  try {
    const { paymentMethod } = req.body;
    const user = req.user;

    if (!user || !user.email) {
      return res.status(400).json({ success: false, message: "User information missing." });
    }

    const userRole = user.occupation || user.role || "student";
    const schoolName = user.schoolName || "";
    const schoolCountry = user.schoolCountry || "GH"; // ✅ default to Ghana

    // --- Compute price for user ---
    const priceDetails = await getUserPrice(user, userRole, schoolName, schoolCountry);

    if (!priceDetails || typeof priceDetails.ghsPrice !== "number" || !priceDetails.currency) {
      return res.status(400).json({ success: false, message: `No pricing available for country code: ${schoolCountry}` });
    }

    const { ghsPrice, currency, displayPrice, displayCurrency, pricingType } = priceDetails;

    if (ghsPrice <= 0) {
      return res.status(400).json({ success: false, message: "Invalid payment amount." });
    }

    const gateway = paymentMethod || "paystack";
    let paymentResponse;

    switch (gateway) {
      case "paystack":
        console.log("🚀 Initializing Paystack payment with:", { email: user.email, ghsAmount: ghsPrice, currency, pricingType });
        paymentResponse = await initPaystackPayment({ email: user.email, ghsAmount: ghsPrice });
        break;

      case "flutterwave":
        console.log("🚀 Initializing Flutterwave payment with:", { email: user.email, amount: ghsPrice, currency, pricingType });
        paymentResponse = await initFlutterwavePayment({ email: user.email, amount: ghsPrice, currency });
        break;

      default:
        return res.status(400).json({ success: false, message: "Unsupported payment gateway." });
    }

    return res.json({ success: true, gateway, paymentData: paymentResponse, displayPrice, displayCurrency, pricingType });

  } catch (err) {
    console.error("❌ Payment initialization error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// --- Webhook handlers ---
const handlePaystackWebhook = (req, res) => handleWebhook(req, res, "paystack");
const handleFlutterwaveWebhook = (req, res) => handleWebhook(req, res, "flutterwave");

module.exports = {
  initializePayment,
  handlePaystackWebhook,
  handleFlutterwaveWebhook,
};





