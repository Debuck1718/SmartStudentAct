// utils/currencyConverter.js
const axios = require("axios");
const apiKey = process.env.EXCHANGE_RATE_API_KEY;

let ratesCache = { data: {}, timestamp: null };

async function getRate(fromCurrency = "USD", toCurrency = "GHS") {
 
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    console.log(`⚡ Skipping conversion: ${fromCurrency} → ${toCurrency} is the same.`);
    return 1;
  }

  if (!apiKey) {
    console.error("❌ EXCHANGE_RATE_API_KEY is not defined in environment variables.");
    return null;
  }

  const oneHour = 60 * 60 * 1000;
  const cacheKey = `${fromCurrency}_${toCurrency}`;

  if (
    ratesCache.timestamp &&
    (Date.now() - ratesCache.timestamp) < oneHour &&
    ratesCache.data[cacheKey]
  ) {
    console.log(`✅ Using cached currency rate for ${fromCurrency} → ${toCurrency}`);
    return ratesCache.data[cacheKey];
  }

  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${fromCurrency}/${toCurrency}`;

  try {
    console.log(`🔄 Fetching new rate: ${fromCurrency} → ${toCurrency}`);
    const response = await axios.get(url);

    if (response.data.result === "success") {
      const rate = response.data.conversion_rate;
      ratesCache.data[cacheKey] = rate;
      ratesCache.timestamp = Date.now();
      return rate;
    } else {
      console.error("❌ Currency API error:", response.data["error-type"]);
      return null;
    }
  } catch (error) {
    console.error("❌ Error fetching currency rates:", error.message);
    return null;
  }
}

module.exports = { getRate };


