const axios = require("axios");
const jwt = require("jsonwebtoken");
const config = require("../config/paymentConfig");

async function initPaystackPayment({ email, amount, currency, phoneNumber = null, token = null }) {
  try {
    let payload = { email, amount, currency, phoneNumber };

    // ✅ If token is provided, decode and override payload
    if (token) {
      const decoded = jwt.verify(token, config.jwtSecret);
      payload = { ...payload, ...decoded };
    }

    const amountInKobo = Math.round(payload.amount * 100);

    console.log(
      `Initiating Paystack payment for ${payload.email}, amount: ${amountInKobo} (${payload.currency}).`
    );

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: payload.email,
        amount: amountInKobo,
        currency: payload.currency,
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
      return null;
    }
  } catch (error) {
    console.error(
      "Error initiating Paystack payment:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
}

module.exports = { initPaystackPayment };
