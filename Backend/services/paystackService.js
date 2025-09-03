const Paystack = require("@paystack/paystack-sdk").default;
const config = require("../config/paymentConfig");

const paystack = new Paystack(config.paystack.secretKey);


async function initPaystackPayment({ email, amount, currency }) {
  try {
    if (!email || !amount || !currency) {
      throw new Error("Missing required Paystack payment parameters.");
    }

    // Convert amount based on currency
    let amountInSubunits;
    switch (currency.toUpperCase()) {
      case "GHS": // Ghana Cedis
        amountInSubunits = Math.round(amount * 100); // pesewas
        break;
      case "NGN": // Nigerian Naira
        amountInSubunits = Math.round(amount * 100); // kobo
        break;
      case "USD": // US Dollars
        amountInSubunits = Math.round(amount * 100); // cents
        break;
      default:
        throw new Error(`Unsupported currency: ${currency}`);
    }

    const response = await paystack.transaction.initialize({
      email,
      amount: amountInSubunits,
      currency,
    });

    return response;
  } catch (error) {
    console.error("❌ Error initiating Paystack payment:", error.message);
    throw error;
  }
}


module.exports = { initPaystackPayment };


