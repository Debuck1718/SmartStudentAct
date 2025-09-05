// Corrected services/paystackService.js
const Paystack = require("@paystack/paystack-sdk").default;
const config = require("../config/paymentConfig");
const { getRate } = require("../utils/currencyConverter");

const paystack = new Paystack(config.paystack.secretKey);

async function initPaystackPayment({ email, amount, currency }) {
  try {
    if (!email || !amount || !currency) {
      throw new Error("Missing required Paystack payment parameters.");
    }
    
  
    const usdToGhsRate = await getRate("USD", "GHS");
    const ghsAmount = +(amount * usdToGhsRate).toFixed(2);
    

    const amountInSubunits = Math.round(ghsAmount * 100);

    console.log("🔎 Sending to Paystack:", {
      email,
      amount: ghsAmount,
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
    console.error("❌ Error initiating Paystack payment:", error.message);
    throw error;
  }
}

module.exports = { initPaystackPayment };

