const axios = require('axios');

const apiKey = process.env.EXCHANGE_RATE_API_KEY;

let ratesCache = {
  data: {},
  timestamp: null,
};

async function getRate(toCurrency) {
  const oneHour = 60 * 60 * 1000;
  const url = `https://v6.exchangerate-api.com/v6/70128e676fb8eb28e22c1826/latest/USD`;

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
