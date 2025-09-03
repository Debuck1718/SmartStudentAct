const { Paystack } = require("@paystack/paystack-sdk");
const config = require("../config/paymentConfig");

// Initialize Paystack client
const paystack = new Paystack(config.paystack.secretKey);

async function initPaystackPayment({ email, amount, currency }) {
  try {
    // Paystack requires smallest currency unit → multiply by 100
    const amountInKobo = Math.round(amount * 100);

    console.log(
      `Initiating Paystack payment for ${email}, amount: ${amountInKobo} (${currency}).`
    );

    const response = await paystack.transaction.initialize({
      email,
      amount: amountInKobo,
      currency,
    });

    if (response?.status === true) {
      return response.data; // ✅ payment data with authorization_url, access_code, reference
    } else {
      console.error("Paystack API returned error:", response);
      throw new Error(response?.message || "Paystack initialization failed");
    }
  } catch (error) {
    console.error(
      "Error initiating Paystack payment:",
      error.response?.data || error.message
    );
    throw error; // bubble up to route
  }
}

module.exports = { initPaystackPayment };
