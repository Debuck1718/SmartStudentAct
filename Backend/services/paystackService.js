// services/paystackService.js
const Paystack = require("@paystack/paystack-sdk").default;
const config = require("../config/paymentConfig");

const paystack = new Paystack(config.paystack.secretKey);

async function initPaystackPayment({ email, amount, currency }) {
  try {
    if (!email || !amount || !currency) {
      throw new Error("Missing required Paystack payment parameters.");
    }

    const amountInSubunits = Math.round(amount * 100);

    console.log("🔎 Sending to Paystack:", {
      email,
      amount,
      amountInSubunits,
      forcedCurrency: currency,
    });

    const response = await paystack.transaction.initialize({
      email,
      amount: amountInSubunits,
      currency,
    });

    return response.data;
  } catch (err) {
    console.error("❌ Paystack init error:", err.message);
    return null;
  }
}

module.exports = { initPaystackPayment };



