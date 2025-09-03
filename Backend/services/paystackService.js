const Paystack = require("@paystack/paystack-sdk").default;
const config = require("../config/paymentConfig");

const paystack = new Paystack(config.paystack.secretKey);


async function initPaystackPayment({ email, amount, currency }) {
  try {
    if (!email || !amount || !currency) {
      throw new Error("Missing required Paystack payment parameters.");
    }

  
    const amountInKobo = Math.round(amount * 100);

    console.log(
      `👉 Initiating Paystack payment | Email: ${email} | Amount: ${amountInKobo} | Currency: ${currency}`
    );

    const response = await paystack.transaction.initialize({
      email,
      amount: amountInKobo,
      currency, 
    });

    if (response?.status === true && response?.data) {
      return response.data;
    } else {
      console.error("❌ Paystack API error:", response);
      throw new Error(response?.message || "Paystack initialization failed");
    }
  } catch (error) {
    console.error(
      "❌ Error initiating Paystack payment:",
      error.response?.data || error.message
    );
    throw error;
  }
}

module.exports = { initPaystackPayment };


