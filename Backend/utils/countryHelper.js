const countries = require("i18n-iso-countries");
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

function toIsoCountryCode(countryInput) {
  if (!countryInput) return null;

  // If already ISO code
  if (
    countryInput.length === 2 &&
    countries.isValid(countryInput.toUpperCase())
  ) {
    return countryInput.toUpperCase();
  }

  // Convert from full country name → ISO code
  const code = countries.getAlpha2Code(countryInput, "en");
  return code || countryInput; // fallback if not found
}

module.exports = { toIsoCountryCode };
