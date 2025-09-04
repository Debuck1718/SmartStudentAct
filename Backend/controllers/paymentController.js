// controllers/paymentController.js
const { getUserPrice } = require("../services/pricingService");
const { initPaystackPayment } = require("../services/paystackService");
const { initFlutterwavePayment } = require("../services/flutterwaveService");
const { handleWebhook } = require("./webhookController");

async function initializePayment(req, res) {
   try {

    const { paymentMethod } = req.body;

    const user = req.user;



    if (!user || !user.email) {

      return res

        .status(400)

        .json({ success: false, message: "User information missing." });

    }

    const priceDetails = await getUserPrice(
      user,
      userRole,
      schoolName,
      user.schoolCountry || ""
    );

    if (
      !priceDetails ||
      typeof priceDetails.localPrice !== "number" ||
      !priceDetails.currency
    ) {
      return res.status(400).json({
        success: false,
        message: "Pricing not available for this user.",
      });
    }

    const { localPrice, currency, displayPrice, displayCurrency } = priceDetails;

    if (localPrice <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment amount." });
    }

    const gateway = paymentMethod || "paystack";
    let paymentResponse;

    switch (gateway) {
      case "paystack":
        paymentResponse = await initPaystackPayment({
          email: user.email,
          amount: localPrice, 
          currency: currency, 
        });
        break;

      case "flutterwave":
        paymentResponse = await initFlutterwavePayment({
          email: user.email,
          amount: localPrice,
          currency: currency, 
        });
        break;

      default:
        return res
          .status(400)
          .json({ success: false, message: "Unsupported payment gateway." });
    }

    if (!paymentResponse) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to initialize payment." });
    }

    return res.json({
      success: true,
      gateway,
      paymentData: paymentResponse,
      displayPrice,
      displayCurrency,
    });
  } catch (err) {
    console.error("Payment initialization error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

const handlePaystackWebhook = (req, res) =>
  handleWebhook(req, res, "paystack");
const handleFlutterwaveWebhook = (req, res) =>
  handleWebhook(req, res, "flutterwave");

module.exports = {
  initializePayment,
  handlePaystackWebhook,
  handleFlutterwaveWebhook,
};
