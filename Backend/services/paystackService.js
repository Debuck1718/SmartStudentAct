const axios = require("axios");
const config = require("../config/paymentConfig");

async function initPaystackPayment({ email, amount, currency }) {
  try {
    const amountInKobo = Math.round(amount * 100);

    console.log(
      `Initiating Paystack payment for ${email}, amount: ${amountInKobo} (${currency}).`
    );

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amountInKobo,
        currency,
      },
      {
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.status === true) {
      return response.data.data;
    } else {
      console.error("Paystack API returned a non-success status:", response.data);
      throw new Error(
        response.data?.message || "Paystack initialization failed"
      );
    }
  } catch (error) {
    console.error(
      "Error initiating Paystack payment:",
      error.response?.data || error.message
    );
    // 🚨 Don't swallow — bubble up so your router returns the actual error
    throw error;
  }
}

module.exports = { initPaystackPayment };
