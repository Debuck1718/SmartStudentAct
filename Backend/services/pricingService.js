// services/pricingService.js
const School = require("../models/School");
const { getRate } = require("../utils/currencyConverter");
const logger = require("../utils/logger");

const schoolCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const rateCache = new Map();
const RATE_TTL = 10 * 60 * 1000;

const USD_BASE = { student: 10, teacher: 15, admin: 20 };
const USD_TIER5 = { student: 17, teacher: 22, admin: 25 };


const pricingData = {
  default: USD_BASE,
  tier3_4: { student: 5.1, teacher: 9, admin: 10.1 }, 
  regional: {
    ZA: { student: 30, teacher: 75, admin: 105, teacher_free: true }, 
    ZM: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    TN: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    LY: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    MA: { student: 45, teacher: 90, admin: 150, teacher_free: true },
  },
};


const LOCAL_OVERRIDES = {
  GH: { currency: "GHS", student: 1.2, teacher: 4.8, admin: 7 },
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
    const school = await School.findOne({
      name: new RegExp(`^${schoolName}$`, "i"),
    });
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
    return {
      ghsPrice: 0,
      localPrice: 0,
      currency: "GHS",
      displayPrice: 0,
      displayCurrency: "USD",
    };
  }

  let tier = (await getSchoolTier(schoolName)) || 1;
  const countryCode = normalizeCountry(user, schoolCountry);


  let usdPrice = USD_BASE[role] || 10;

 
  if (tier === 5) {
    usdPrice = USD_TIER5[role] ?? usdPrice;
  } else if (tier === 3 || tier === 4) {
    usdPrice = pricingData.tier3_4[role] ?? usdPrice;
  }

  
  if (pricingData.regional[countryCode]?.[role] != null) {
    usdPrice = pricingData.regional[countryCode][role];
    if (role === "teacher" && pricingData.regional[countryCode]?.teacher_free) {
      usdPrice = 0;
    }
  }

  
  if (countryCode && LOCAL_OVERRIDES[countryCode]) {
    const override = LOCAL_OVERRIDES[countryCode];
    usdPrice = override[role] ?? usdPrice;
  }

  
  const usdToGhsRate = await getCachedRate("USD", "GHS");
  const ghsPrice = +(usdPrice * usdToGhsRate).toFixed(2);

  
  let displayPrice = usdPrice;
  let displayCurrency = "USD";

  if (countryCode === "GH") {
    displayPrice = ghsPrice;
    displayCurrency = "GHS";
  } else if (countryCode) {
    try {
      const usdToLocalRate = await getCachedRate("USD", countryCode);
      displayPrice = +(usdPrice * usdToLocalRate).toFixed(2);
      displayCurrency = countryCode;
    } catch {
      displayPrice = usdPrice;
      displayCurrency = "USD";
    }
  }

  return {
    ghsPrice, 
    localPrice: displayPrice, 
    currency: displayCurrency,
    displayPrice,
    displayCurrency,
  };
}

module.exports = { getUserPrice };

