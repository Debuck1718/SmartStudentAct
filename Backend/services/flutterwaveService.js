const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("../config/paymentConfig");

async function initFlutterwavePayment({ email, amount, currency, phoneNumber = null, token = null }) {
  try {
    let payload = { email, amount, currency, phoneNumber };

    // ✅ If token is provided, decode and override payload
    if (token) {
      const decoded = jwt.verify(token, config.jwtSecret);
      payload = { ...payload, ...decoded };
    }

    const transactionReference = `TX-${crypto.randomUUID()}`;

    console.log(
      `Initiating Flutterwave payment for ${payload.email}, amount: ${payload.amount} ${payload.currency}, ref: ${transactionReference}`
    );

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: transactionReference,
        amount: payload.amount,
        currency: payload.currency,
        redirect_url: config.flutterwave.redirectURL,
        customer: { email: payload.email },
      },
      {
        headers: {
          Authorization: `Bearer ${config.flutterwave.secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.status === "success") {
      return response.data.data;
    } else {
      console.error(
        "Flutterwave API returned a non-success status:",
        response.data
      );
      return null;
    }
  } catch (error) {
    console.error(
      "Error initiating Flutterwave payment:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
}

module.exports = { initFlutterwavePayment };

