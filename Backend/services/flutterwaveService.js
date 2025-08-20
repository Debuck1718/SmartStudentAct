// flutterwaveService.js
// This module provides a secure way to interact with the Flutterwave Payments API.
// It is designed to be used on a backend server, not directly by a mobile app.

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/paymentConfig');

/**
 * Initializes a Flutterwave payment on the backend.
 * This function should be called by an API endpoint on your server.
 * The mobile app will then be redirected to the checkout URL returned by this function.
 *
 * @param {string} email - The customer's email address.
 * @param {number} amount - The amount to be charged.
 * @param {string} currency - The currency code (e.g., 'GHS', 'USD').
 * @returns {Promise<object|null>} The payment data from Flutterwave, or null on error.
 */
async function initFlutterwavePayment(email, amount, currency) {
  // Use a more robust transaction reference to avoid collisions.
  // A combination of a prefix and a UUID is a good practice.
  const transactionReference = `TX-${crypto.randomUUID()}`;

  // Log the transaction details for debugging and tracking.
  console.log(`Initiating Flutterwave payment for ${email}, amount: ${amount} ${currency}, ref: ${transactionReference}`);

  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      {
        tx_ref: transactionReference,
        amount,
        currency,
        redirect_url: config.flutterwave.redirectURL,
        customer: { email }
      },
      {
        headers: {
          // IMPORTANT: Use the secret key for server-side API calls.
          Authorization: `Bearer ${config.flutterwave.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Check if the API call was successful.
    if (response.data && response.data.status === 'success') {
      return response.data.data;
    } else {
      console.error('Flutterwave API returned a non-success status:', response.data);
      return null;
    }
  } catch (error) {
    // Handle network errors, invalid API keys, etc. gracefully.
    console.error('Error initiating Flutterwave payment:', error.response ? error.response.data : error.message);
    return null;
  }
}

module.exports = { initFlutterwavePayment };
