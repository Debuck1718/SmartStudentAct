// services/pricingService.js
const School = require("../models/School");
const { getRate } = require("../utils/currencyConverter");
const logger = require("../utils/logger");

const schoolCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const rateCache = new Map();
const RATE_TTL = 10 * 60 * 1000;

// --- GHS Tier Prices ---
const GHS_TIER5 = { student: 241, teacher: 266, admin: 302 };
const GHS_TIER3_4 = { student: 55, teacher: 75, admin: 110 };

// --- Ghana local overrides ---
const LOCAL_OVERRIDES = {
  GH: { currency: "GHS", student: 15, teacher: 52, admin: 73 },
};

// --- Regional African pricing ---
const REGIONAL_PRICING = {
  ZA: { student: 30, teacher: 75, admin: 105, teacher_free: true },
  ZM: { student: 30, teacher: 75, admin: 105, teacher_free: true },
  TN: { student: 30, teacher: 75, admin: 105, teacher_free: true },
  LY: { student: 30, teacher: 75, admin: 105, teacher_free: true },
  MA: { student: 40, teacher: 90, admin: 150, teacher_free: true },
};

// --- Non-African countries (USD pricing) ---
const NON_AFRICA_COUNTRIES_USD = ["US", "CA", "GB", "FR", "DE"];
const NON_AFRICA_PRICES_USD = { student: 20, teacher: 35, admin: 40 }; // USD prices



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

// --- Normalize schoolCountry only ---
function normalizeCountry(schoolCountry) {
  if (!schoolCountry) return null;
  let code = schoolCountry.toString().trim().toUpperCase();
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

module.exports = { getUserPrice };





