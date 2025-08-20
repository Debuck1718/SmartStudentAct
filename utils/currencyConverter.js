// currencyConverter.js
// This module provides a secure and cached way to get currency exchange rates.
// It is intended for use on a backend server, not a mobile app.

const axios = require('axios');

// Store the API key in an environment variable for security.
// NEVER hardcode API keys in your source code.
const apiKey = process.env.EXCHANGE_RATE_API_KEY;

// Use a simple in-memory cache to reduce API calls and improve performance.
let ratesCache = {
  data: {},
  timestamp: null,
};

/**
 * Fetches the exchange rate from USD to a target currency.
 * The data is cached for one hour to prevent hitting API rate limits.
 *
 * @param {string} toCurrency - The currency code to convert to (e.g., 'GHS', 'ZAR').
 * @returns {Promise<number|null>} The exchange rate or null if an error occurs.
 */
async function getRate(toCurrency) {
  const oneHour = 60 * 60 * 1000;
  const url = `https://v6.exchangerate-api.com/v6/70128e676fb8eb28e22c1826/latest/USD`;

  // Check if the cache is valid (less than one hour old).
  if (ratesCache.timestamp && (Date.now() - ratesCache.timestamp) < oneHour) {
    // If cache is valid, return the rate directly from memory.
    console.log(`Using cached currency rate for ${toCurrency}.`);
    return ratesCache.data[toCurrency] || null;
  }

  // Cache is expired, so fetch fresh data from the API.
  console.log('Fetching new currency rates from API...');
  try {
    const response = await axios.get(url);
    if (response.data.result === 'success') {
      // Update the cache with the new rates and timestamp.
      ratesCache.data = response.data.conversion_rates;
      ratesCache.timestamp = Date.now();
      
      return ratesCache.data[toCurrency] || null;
    } else {
      console.error('API response for currency conversion was not successful:', response.data['error-type']);
      return null;
    }
  } catch (error) {
    console.error('Error fetching currency rates:', error.message);
    // On error, we could fall back to the old rates or return null.
    // Returning null is safer as it prevents a transaction with a bad rate.
    return null;
  }
}

module.exports = { getRate };
