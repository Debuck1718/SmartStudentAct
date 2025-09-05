// Corrected services/paystackService.js
const Paystack = require("@paystack/paystack-sdk").default;
const config = require("../config/paymentConfig");

const paystack = new Paystack(config.paystack.secretKey);

async function initPaystackPayment({ email, amount, currency }) {
  try {
    if (!email || !amount || !currency) {
      throw new Error("Missing required Paystack payment parameters.");
    }

    const amountInSubunits = Math.round(amount * 100);

    console.log(" Sending to Paystack:", {
      email,
      amount,
      amountInSubunits,
      forcedCurrency: "GHS",
    });


    const response = await paystack.transaction.initialize({
      email,
      amount: amountInSubunits,
      currency: "GHS",
    });

    return response;
  } catch (error) {
    console.error(" Error initiating Paystack payment:", error.message);
    throw error;
  }
}

module.exports = { initPaystackPayment };

