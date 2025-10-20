import School from "../models/School.js";
import { getRate } from "../utils/currencyConverter.js";
import logger from "../utils/logger.js";


const schoolCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; 
const rateCache = new Map();
const RATE_TTL = 10 * 60 * 1000; 


const GH_PRICES = { student: 15, teacher: 52, admin: 73, worker: 35 };
const GH_TIERS = {
  5: { student: 241, teacher: 266, admin: 302 },
  3: { student: 55, teacher: 75, admin: 110 },
  4: { student: 55, teacher: 75, admin: 110 },
};


const WORKER_PRICING = {
  GH: 35, 
  AFRICA: 55, 
  NON_AFRICA: 120, 
};


const AFRICA_COUNTRIES_USD = [
  "ZA", "ZM", "TN", "LY", "MA", "NG", "KE", "TZ", "UG", "RW", "BW", "CM", "SN", "GH"
];


const NON_AFRICA_COUNTRIES_USD = [
  "US", "CA", "GB", "FR", "DE", "AU", "IT", "ES", "NL", "JP", "CN"
];



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
    UGANDA: "UG",
    RWANDA: "RW",
  };

  return NAME_TO_CODE[code] || code;
}

function validateRole(role) {
  const valid = ["student", "teacher", "admin", "worker"];
  return valid.includes(role) ? role : "student";
}



export async function getUserPrice(user, role, schoolName, schoolCountry) {
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

  if (!schoolCountry) {
    logger.warn("School country missing for user, defaulting to GH");
    schoolCountry = "GH";
  }

  const countryCode = normalizeCountry(schoolCountry);
  const isGhana = countryCode === "GH";
  const isAfrica = AFRICA_COUNTRIES_USD.includes(countryCode);
  const isNonAfrica = NON_AFRICA_COUNTRIES_USD.includes(countryCode);


  if (role === "worker") {
    let ghsPrice = WORKER_PRICING.GH;
    let usdPrice = 0;
    let displayCurrency = "GHS";
    let pricingType = "Worker Ghana";

    if (!isGhana) {
      if (isAfrica) {
        ghsPrice = WORKER_PRICING.AFRICA;
        pricingType = "Worker Africa";
      } else {
        ghsPrice = WORKER_PRICING.NON_AFRICA;
        pricingType = "Worker Non-Africa";
      }
      const ghsToUsdRate = await getCachedRate("GHS", "USD");
      usdPrice = +(ghsPrice * ghsToUsdRate).toFixed(2);
      displayCurrency = "USD";
    }

    logger.info("Worker price calculated", {
      role,
      ghsPrice,
      usdPrice,
      countryCode,
      pricingType,
    });

    return {
      ghsPrice,
      usdPrice,
      localPrice: ghsPrice,
      currency: displayCurrency,
      displayPrice: ghsPrice,
      displayCurrency,
      pricingType,
    };
  }

  
  const tier = (await getSchoolTier(schoolName)) || 1;
  let basePrice = GH_TIERS[tier] ? GH_TIERS[tier][role] : GH_PRICES[role];
  let ghsPrice = basePrice;
  let usdPrice = 0;
  let displayCurrency = "GHS";
  let pricingType = `GH Tier ${tier}`;

  if (!isGhana) {
    const ghsToUsdRate = await getCachedRate("GHS", "USD");
    usdPrice = +(ghsPrice * ghsToUsdRate).toFixed(2);

    if (isAfrica) {
      displayCurrency = "USD";
      pricingType += " (Africa USD)";
    } else if (isNonAfrica) {
      displayCurrency = "USD";
      pricingType += " (Non-Africa USD)";
    } else {
      displayCurrency = "USD";
      pricingType += " (Other Country USD)";
    }
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

  return {
    ghsPrice,
    usdPrice,
    localPrice: displayPrice,
    currency: displayCurrency,
    displayPrice,
    displayCurrency,
    pricingType,
  };
}








