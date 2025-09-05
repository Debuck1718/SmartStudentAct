const School = require("../models/School");
const { getRate } = require("../utils/currencyConverter");
const logger = require("../utils/logger");

const schoolCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const rateCache = new Map();
const RATE_TTL = 10 * 60 * 1000;

// --- Base prices in GHS ---
const GHS_BASE = { student: 180, teacher: 204, admin: 241 };
const GHS_TIER5 = { student: 241, teacher: 266, admin: 302 };

const pricingData = {
  default: GHS_BASE,
  tier3_4: { student: 55, teacher: 75, admin: 110 },
  regional: {
    ZA: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    ZM: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    TN: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    LY: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    MA: { student: 40, teacher: 90, admin: 150, teacher_free: true },
  },
};

const LOCAL_OVERRIDES = {
  GH: { currency: "GHS", student: 16, teacher: 52, admin: 73 },
};

async function getCachedRate(from, to) {
  const key = `${from}_${to}`;
  const cached = rateCache.get(key);
  if (cached && Date.now() - cached.timestamp < RATE_TTL) {
    return cached.value;
  }
  const rate = await getRate(from, to);
  rateCache.set(key, { value: rate, timestamp: Date.now() });
  return rate;
}

async function getSchoolTier(schoolName) {
  if (!schoolName) return null;
  const key = schoolName.toLowerCase();
  const cached = schoolCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tier;
  }
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

function normalizeCountry(user, schoolCountry) {
  let code = schoolCountry || user?.schoolCountry || user?.country;
  if (!code) return null;
  code = code.toString().trim().toUpperCase();
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
    return { ghsPrice: 0, usdPrice: 0, localPrice: 0, currency: "GHS", displayPrice: 0, displayCurrency: "USD" };
  }

  const tier = (await getSchoolTier(schoolName)) || 1;
  const countryCode = normalizeCountry(user, schoolCountry);

  // --- Start with GHS base price ---
  let ghsPrice = GHS_BASE[role] || 16;

  // --- Tier adjustments ---
  if (tier === 5) ghsPrice = GHS_TIER5[role] ?? ghsPrice;
  else if (tier === 3 || tier === 4) ghsPrice = pricingData.tier3_4[role] ?? ghsPrice;

  // --- Regional overrides ---
  if (pricingData.regional[countryCode]?.[role] != null) {
    ghsPrice = pricingData.regional[countryCode][role];
    if (role === "teacher" && pricingData.regional[countryCode]?.teacher_free) ghsPrice = 0;
  }

  // --- Local overrides ---
  if (countryCode && LOCAL_OVERRIDES[countryCode]) {
    const override = LOCAL_OVERRIDES[countryCode];
    ghsPrice = override[role] ?? ghsPrice;
  }

  // --- Compute USD equivalent if needed ---
  const ghsToUsdRate = await getCachedRate("GHS", "USD");
  const usdPrice = +(ghsPrice * ghsToUsdRate).toFixed(2);

  // --- Display price ---
  const displayPrice = ghsPrice;
  const displayCurrency = countryCode === "GH" ? "GHS" : "USD";

  // --- Return all prices ---
  return { ghsPrice, usdPrice, localPrice: displayPrice, currency: displayCurrency, displayPrice, displayCurrency };
}

module.exports = { getUserPrice };

