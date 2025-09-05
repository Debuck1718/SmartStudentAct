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
  const countryCode = normalizeCountry(schoolCountry);

  let ghsPrice;
  let usdPrice = 0;
  let pricingType;
  let displayCurrency = "GHS";

  // --- Ghana pricing ---
  if (countryCode === "GH") {
    if (tier === 5) {
      ghsPrice = GHS_TIER5[role] ?? LOCAL_OVERRIDES.GH[role];
      pricingType = "GH Tier 5";
    } else if (tier === 3 || tier === 4) {
      ghsPrice = GHS_TIER3_4[role] ?? LOCAL_OVERRIDES.GH[role];
      pricingType = "GH Tier 3/4";
    } else {
      ghsPrice = LOCAL_OVERRIDES.GH[role];
      pricingType = "GH Base";
    }
  }
  // --- Regional African overrides ---
  else if (REGIONAL_PRICING[countryCode]?.[role] != null) {
    ghsPrice = REGIONAL_PRICING[countryCode][role];
    if (role === "teacher" && REGIONAL_PRICING[countryCode]?.teacher_free) ghsPrice = 0;
    pricingType = "Regional Override";
  }
  // --- Non-African countries (USD) ---
  else if (NON_AFRICA_COUNTRIES_USD.includes(countryCode)) {
    usdPrice = NON_AFRICA_PRICES_USD[role] ?? 20;
    ghsPrice = +(usdPrice * (await getCachedRate("USD", "GHS"))).toFixed(2);
    displayCurrency = "USD";
    pricingType = "Non-African USD";
  }
  // --- Otherwise, throw error ---
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






