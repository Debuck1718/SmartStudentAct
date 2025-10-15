const axios = require('axios');

const apiKey = process.env.EXCHANGE_RATE_API_KEY;
let cache = { data: {}, timestamp: null };

async function getRate(fromCurrency = "USD", toCurrency = "GHS") {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return 1;
  if (!apiKey) return null;

  const cacheKey = `${fromCurrency}_${toCurrency}`;
  const oneHour = 3600 * 1000;

  if (cache.timestamp && (Date.now() - cache.timestamp) < oneHour && cache.data[cacheKey]) {
    return cache.data[cacheKey];
  }

  try {
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${fromCurrency}/${toCurrency}`;
    const res = await axios.get(url);
    if (res.data.result === "success") {
      cache.data[cacheKey] = res.data.conversion_rate;
      cache.timestamp = Date.now();
      return cache.data[cacheKey];
    }
    return null;
  } catch (err) {
    console.error("Currency fetch error:", err.message);
    return null;
  }
}

module.exports = { getRate };
