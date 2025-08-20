// paystackService.js
// This module securely initiates a payment transaction with Paystack.
// It is designed to be used on a backend server, not directly by a mobile app.

const axios = require('axios');
const config = require('../config/paymentConfig');

/**
 * Initializes a payment transaction with Paystack.
 *
 * This function should be called from a secure API endpoint on your server.
 * The mobile app will receive the authorization_url from the response and
 * use it to redirect the user for payment.
 *
 * @param {string} email - The customer's email address.
 * @param {number} amount - The amount to be charged (in the currency's major unit, e.g., NGN).
 * @param {string} currency - The currency code (e.g., 'NGN', 'GHS', 'ZAR').
 * @returns {Promise<object|null>} The payment authorization data from Paystack, or null on error.
 */
async function initPaystackPayment(email, amount, currency) {
  // Paystack requires the amount in the smallest currency unit (e.g., kobo for NGN).
  // We use Math.round to avoid floating point issues.
  const amountInKobo = Math.round(amount * 100);

  // Log the payment details for tracking and debugging.
  console.log(`Initiating Paystack payment for ${email}, amount: ${amountInKobo} (${currency}).`);

  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      { 
        email, 
        amount: amountInKobo, 
        currency 
      },
      { 
        headers: {
          // IMPORTANT: Use the secret key for server-side API calls.
          Authorization: `Bearer ${config.paystack.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Check for success status from Paystack's response.
    if (response.data && response.data.status === true) {
      return response.data.data; // returns { authorization_url, reference, ... }
    } else {
      console.error('Paystack API returned a non-success status:', response.data);
      return null;
    }
  } catch (error) {
    // Handle network errors, invalid API keys, etc. gracefully.
    console.error('Error initiating Paystack payment:', error.response ? error.response.data : error.message);
    return null;
  }
}

module.exports = { initPaystackPayment };

