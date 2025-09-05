async function getUserPrice(user, role, schoolName, schoolCountry) {
  if (!user) throw new Error("User data missing");
  role = validateRole(role?.toLowerCase() || "student");

  if (["overseer", "global_overseer"].includes(role)) {
    return { ghsPrice: 0, usdPrice: 0, localPrice: 0, currency: "GHS", displayPrice: 0, displayCurrency: "USD", pricingType: "overseer" };
  }

  const tier = (await getSchoolTier(schoolName)) || 1;

  // Ensure schoolCountry is present
  if (!schoolCountry) {
    logger.warn("School country missing for user, defaulting to GH");
    schoolCountry = "GH";
  }

  const countryCode = normalizeCountry(schoolCountry);
  if (!countryCode) {
    throw new Error(`No pricing available for country code: ${schoolCountry}`);
  }

  let ghsPrice = 0;
  let usdPrice = 0;
  let pricingType;
  let displayCurrency = "GHS";

  // --- Ghana pricing (GHS base) ---
  if (countryCode === "GH") {
    ghsPrice = GH_PRICES[role];
    displayCurrency = "GHS";
    pricingType = "GH Base";
  }
  // --- African countries in USD ---
  else if (AFRICA_COUNTRIES_USD.includes(countryCode)) {
    usdPrice = AFRICA_PRICES_USD[role];
    const usdToGhsRate = await getCachedRate("USD", "GHS");
    ghsPrice = +(usdPrice * usdToGhsRate).toFixed(2);
    displayCurrency = "USD";
    pricingType = "African USD";
  }
  // --- Non-African countries in USD ---
  else if (NON_AFRICA_COUNTRIES_USD.includes(countryCode)) {
    usdPrice = NON_AFRICA_PRICES_USD[role];
    const usdToGhsRate = await getCachedRate("USD", "GHS");
    ghsPrice = +(usdPrice * usdToGhsRate).toFixed(2);
    displayCurrency = "USD";
    pricingType = "Non-African USD";
  }
  else {
    throw new Error(`No pricing available for country code: ${countryCode}`);
  }

  if (!usdPrice) {
    const ghsToUsdRate = await getCachedRate("GHS", "USD");
    usdPrice = +(ghsPrice * ghsToUsdRate).toFixed(2);
  }

  const displayPrice = ghsPrice;

  logger.info("Final price calculation", { role, ghsPrice, usdPrice, displayPrice, displayCurrency, countryCode, tier, pricingType });

  return { ghsPrice, usdPrice, localPrice: displayPrice, currency: displayCurrency, displayPrice, displayCurrency, pricingType };
}






