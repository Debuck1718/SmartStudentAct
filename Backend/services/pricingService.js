const School = require("../models/School");
const { getRate } = require("../utils/currencyConverter");
const logger = require("../utils/logger");

const schoolCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const rateCache = new Map();
const RATE_TTL = 10 * 60 * 1000;

// --- Ghana base prices (GHS) ---
const GH_PRICES = { student: 15, teacher: 52, admin: 73 };

// --- African countries in USD ---
const AFRICA_COUNTRIES_USD = ["ZA", "ZM", "TN", "LY", "MA", "NG", "KE", "TZ"];
const AFRICA_PRICES_USD = { student: 3, teacher: 7, admin: 10 };

// --- Non-African countries in USD ---
const NON_AFRICA_COUNTRIES_USD = ["US", "CA", "GB", "FR", "DE"];
const NON_AFRICA_PRICES_USD = { student: 20, teacher: 22, admin: 25 };

async function getCachedRate(from, to) {
  const key = `${from}_${to}`;
  const cached = rateCache.get(key);
  if (cached && Date.now() - cached.timestamp < RATE_TTL) return cached.value;

  const rate = await getRate(from, to);
  rateCache.set(key, { value: rate, timestamp: Date.now() });
  return rate;
}

async function getSchoolTier(schoolName) {
  if (!schoolName) return null;
  const key = schoolName.toLowerCase();
  const cached = schoolCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.tier;

  try {
    const school = await School.findOne({ name: new RegExp(`^${schoolName}$`, "i") });
    const tier = school?.tier || null;
    schoolCache.set(key, { tier, timestamp: Date.now() });
    return tier;
  } catch (err) {
    logger.error("Error fetching school tier:", err);
    return null;
  }
}

function normalizeCountry(schoolCountry) {
  if (!schoolCountry) return null;
  const code = schoolCountry.toString().trim().toUpperCase();
  const NAME_TO_CODE = {
    GHANA: "GH",
    NIGERIA: "NG",
    KENYA: "KE",
    SOUTH_AFRICA: "ZA",
    ZAMBIA: "ZM",
    TANZANIA: "TZ",
  };
  return NAME_TO_CODE[code] || code;
}

function validateRole(role) {
  const valid = ["student", "teacher", "admin"];
  return valid.includes(role) ? role : "student";
}

async function getUserPrice(user, role, schoolName, schoolCountry) {
  if (!user) throw new Error("User data missing");
  role = validateRole(role?.toLowerCase() || "student");

  if (["overseer", "global_overseer"].includes(role)) {
    return {
      ghsPrice: 0,
      usdPrice: 0,
      localPrice: 0,
      currency: "GHS",
      displayPrice: 0,
      displayCurrency: "USD",
      pricingType: "overseer",
    };
  }

  const tier = (await getSchoolTier(schoolName)) || 1;

  // Default to Ghana if schoolCountry is missing
  if (!schoolCountry) {
    logger.warn("School country missing for user, defaulting to GH");
    schoolCountry = "GH";
  }

  const countryCode = normalizeCountry(schoolCountry);

  let ghsPrice = 0;
  let usdPrice = 0;
  let pricingType;
  let displayCurrency = "GHS";

  if (countryCode === "GH") {
    // Ghana uses GHS base
    ghsPrice = GH_PRICES[role];
    displayCurrency = "GHS";
    pricingType = "GH Base";
  } else if (AFRICA_COUNTRIES_USD.includes(countryCode)) {
    usdPrice = AFRICA_PRICES_USD[role];
    const usdToGhsRate = await getCachedRate("USD", "GHS");
    ghsPrice = +(usdPrice * usdToGhsRate).toFixed(2);
    displayCurrency = "USD";
    pricingType = "African USD";
  } else if (NON_AFRICA_COUNTRIES_USD.includes(countryCode)) {
    usdPrice = NON_AFRICA_PRICES_USD[role];
    const usdToGhsRate = await getCachedRate("USD", "GHS");
    ghsPrice = +(usdPrice * usdToGhsRate).toFixed(2);
    displayCurrency = "USD";
    pricingType = "Non-African USD";
  } else {
    // fallback to Ghana base if unknown
    ghsPrice = GH_PRICES[role];
    displayCurrency = "GHS";
    pricingType = "GH Base (Fallback)";
  }

  // Convert GHS to USD if needed
  if (!usdPrice) {
    const ghsToUsdRate = await getCachedRate("GHS", "USD");
    usdPrice = +(ghsPrice * ghsToUsdRate).toFixed(2);
  }

  const displayPrice = ghsPrice;

  logger.info("Final price calculation", {
    role,
    ghsPrice,
    usdPrice,
    displayPrice,
    displayCurrency,
    countryCode,
    tier,
    pricingType,
  });

  return { ghsPrice, usdPrice, localPrice: displayPrice, currency: displayCurrency, displayPrice, displayCurrency, pricingType };
}

module.exports = { getUserPrice };






