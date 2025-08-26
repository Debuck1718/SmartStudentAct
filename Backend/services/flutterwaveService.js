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
 * @param {string} email 
 * @param {number} amount 
 * @param {string} currency 
 * @returns {Promise<object|null>} 
 */
async function initFlutterwavePayment(email, amount, currency) {
 
  const transactionReference = `TX-${crypto.randomUUID()}`;

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
          Authorization: `Bearer ${config.flutterwave.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.status === 'success') {
      return response.data.data;
    } else {
      console.error('Flutterwave API returned a non-success status:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Error initiating Flutterwave payment:', error.response ? error.response.data : error.message);
    return null;
  }
}

module.exports = { initFlutterwavePayment };
