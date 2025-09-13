// ✅ utils/countryHelpers.js
const countries = require("i18n-iso-countries");

countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

function toIsoCountryCode(input) {
  if (!input) return "";
  const upper = input.toUpperCase();

  
  if (countries.isValid(upper)) return upper;

  
  const code = countries.getAlpha2Code(input, "en");
  return code || input; 
}

function fromIsoCountryCode(iso) {
  if (!iso) return "";
  return countries.getName(iso, "en") || iso;
}

module.exports = { toIsoCountryCode, fromIsoCountryCode };

