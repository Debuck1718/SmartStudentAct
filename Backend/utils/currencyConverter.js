// Corrected currencyConverter.js
const axios = require('axios');

const apiKey = process.env.EXCHANGE_RATE_API_KEY;

let ratesCache = {
  data: {},
  timestamp: null,
};

async function getRate(toCurrency) {
  if (!apiKey) {
    console.error('EXCHANGE_RATE_API_KEY is not defined in environment variables.');
    return null;
  }
  const oneHour = 60 * 60 * 1000;
  
  // ✅ FIX: Use the apiKey from process.env to build the URL
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;

  if (ratesCache.timestamp && (Date.now() - ratesCache.timestamp) < oneHour) {
    console.log(`Using cached currency rate for ${toCurrency}.`);
    return ratesCache.data[toCurrency] || null;
  }

  console.log('Fetching new currency rates from API...');
  try {
    const response = await axios.get(url);
    if (response.data.result === 'success') {
      ratesCache.data = response.data.conversion_rates;
      ratesCache.timestamp = Date.now();
      
      return ratesCache.data[toCurrency] || null;
    } else {
      console.error('API response for currency conversion was not successful:', response.data['error-type']);
      return null;
    }
  } catch (error) {
    console.error('Error fetching currency rates:', error.message);
    return null;
  }
}

module.exports = { getRate };
