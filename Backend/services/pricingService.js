const School = require("../models/School");
const { getRate } = require("../utils/currencyConverter");
const logger = require("../utils/logger");

const schoolCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const rateCache = new Map();
const RATE_TTL = 10 * 60 * 1000;


const GHS_TIER5 = { student: 241, teacher: 266, admin: 302 };


const GHS_TIER3_4 = { student: 55, teacher: 75, admin: 110 };


const GHS_BASE_DEFAULT = { student: 15, teacher: 52, admin: 73 };


const REGIONAL_PRICING = {
  ZA: { student: 30, teacher: 75, admin: 105, teacher_free: true },
  ZM: { student: 30, teacher: 75, admin: 105, teacher_free: true },
  TN: { student: 30, teacher: 75, admin: 105, teacher_free: true },
  LY: { student: 30, teacher: 75, admin: 105, teacher_free: true },
  MA: { student: 40, teacher: 90, admin: 150, teacher_free: true },
};


const LOCAL_OVERRIDES = {
  GH: { currency: "GHS", student: 15, teacher: 52, admin: 73 },
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

 
  let ghsPrice = GHS_BASE_DEFAULT[role] ?? 15;

  if (countryCode === "GH" && (tier === 3 || tier === 4)) {
    ghsPrice = GHS_TIER3_4[role] ?? ghsPrice;
  }

 
  if (countryCode === "GH" && tier === 5) {
    ghsPrice = GHS_TIER5[role] ?? ghsPrice;
  }

 
  if (REGIONAL_PRICING[countryCode]?.[role] != null) {
    ghsPrice = REGIONAL_PRICING[countryCode][role];
    if (role === "teacher" && REGIONAL_PRICING[countryCode]?.teacher_free) {
      ghsPrice = 0;
    }
  }

  
  if (countryCode === "GH" && LOCAL_OVERRIDES[countryCode]) {
    const override = LOCAL_OVERRIDES[countryCode];
    ghsPrice = override[role] ?? ghsPrice;
  }

 
  const ghsToUsdRate = await getCachedRate("GHS", "USD");
  const usdPrice = +(ghsPrice * ghsToUsdRate).toFixed(2);

 
  const displayPrice = ghsPrice;
  const displayCurrency = "GHS";


  logger.info("Final price calculation", { role, ghsPrice, usdPrice, displayPrice, displayCurrency, countryCode, tier });

  return { ghsPrice, usdPrice, localPrice: displayPrice, currency: displayCurrency, displayPrice, displayCurrency };
}

module.exports = { getUserPrice };



