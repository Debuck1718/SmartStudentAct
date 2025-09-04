// services/pricingService.js
const School = require('../models/School');
const { getRate } = require('../utils/currencyConverter');
const logger = require('../utils/logger');

// Simple in-memory cache for school lookups
const schoolCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getSchoolTier(schoolName) {
  if (!schoolName) return null;

  const key = schoolName.toLowerCase();
  const cached = schoolCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tier;
  }

  try {
    const school = await School.findOne({ name: new RegExp(`^${schoolName}$`, 'i') });
    const tier = school?.tier || null;
    schoolCache.set(key, { tier, timestamp: Date.now() });
    return tier;
  } catch (err) {
    logger.error("Error fetching school data:", err);
    return null;
  }
}

const COUNTRY_CURRENCY_MAP = {
  // Africa only
  DZ: 'DZD', EG: 'EGP', LY: 'LYD', MA: 'MAD', TN: 'TND',
  BJ: 'XOF', BF: 'XOF', CI: 'XOF', GM: 'GMD', GH: 'GHS', GW: 'XOF',
  GN: 'GNF', ML: 'XOF', MR: 'MRO', NE: 'XOF', NG: 'NGN', SN: 'XOF',
  SL: 'SLL', TG: 'XOF',
  AO: 'AOA', CM: 'XAF', CF: 'XAF', TD: 'XAF', CG: 'XAF', CD: 'CDF',
  GQ: 'XAF', GA: 'XAF',
  BI: 'BIF', DJ: 'DJF', ER: 'ERN', ET: 'ETB', KE: 'KES', RW: 'RWF',
  SO: 'SOS', SS: 'SSP', SD: 'SDG', TZ: 'TZS', UG: 'UGX',
  BW: 'BWP', KM: 'KMF', LS: 'LSL', MG: 'MGA', MW: 'MWK', MU: 'MUR',
  MZ: 'MZN', NA: 'NAD', SC: 'SCR', ZA: 'ZAR', SZ: 'SZL', ZM: 'ZMW',
  ZW: 'ZWD',
};


const AFRICA_BASE = { student: 15, teacher: 45, admin: 60 };
const OUTSIDE_AFRICA_BASE = { student: 10, teacher: 15, admin: 17 };
const OUTSIDE_AFRICA_TIER5 = { student: 17, teacher: 22, admin: 25 };

const pricingData = {
  default: AFRICA_BASE,
  tier3_4: { student: 75, teacher: 150, admin: 150 },
  regional: {
    ZA: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    ZM: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    TN: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    LY: { student: 30, teacher: 75, admin: 105, teacher_free: true },
    MA: { student: 45, teacher: 90, admin: 150, teacher_free: true },
  },
};


const LOCAL_OVERRIDES = {
  GH: { currency: 'GHS', student: 15, teacher: 50, admin: 70 },
};

function normalizeCountry(user, schoolCountry) {
  let code = schoolCountry || user?.schoolCountry || user?.country;
  if (!code) return null;

  code = code.toString().trim().toUpperCase();
  const NAME_TO_CODE = {
    GHANA: 'GH',
    NIGERIA: 'NG',
    KENYA: 'KE',
    SOUTH_AFRICA: 'ZA',
    ZAMBIA: 'ZM',
    TANZANIA: 'TZ',
  };

  return NAME_TO_CODE[code] || code;
}

function validateRole(role) {
  const validRoles = ['student', 'teacher', 'admin'];
  if (!validRoles.includes(role)) {
    logger.warn(`Invalid role "${role}" provided. Defaulting to "student".`);
    return 'student';
  }
  return role;
}

async function getUserPrice(user, role, schoolName, schoolCountry) {
  if (!user) throw new Error("User data missing.");

  if (['overseer', 'global_overseer'].includes(role)) {
    return {
      ghsPrice: 0,
      localPrice: 0,
      currency: 'GHS',
      displayPrice: 0,
      displayCurrency: 'USD',
    };
  }

  role = validateRole(role?.toLowerCase() || "student");
  let ghsPrice = pricingData.default[role] || 15;
  let tier = 1;

  const countryCode = normalizeCountry(user, schoolCountry);
  const isAfrica = countryCode && COUNTRY_CURRENCY_MAP[countryCode];

  if (!isAfrica) {
    tier = (await getSchoolTier(schoolName)) || tier;

    const usdPrice =
      tier === 5
        ? OUTSIDE_AFRICA_TIER5[role] ?? OUTSIDE_AFRICA_BASE[role]
        : OUTSIDE_AFRICA_BASE[role];

    const rate = await getRate("GHS").catch(() => null);
    if (!rate) {
      throw new Error("Currency conversion rate not available. Please try again later.");
    }
    const ghsEquivalent = usdPrice * rate;

    return {
      ghsPrice: parseFloat(ghsEquivalent.toFixed(2)),
      localPrice: parseFloat(ghsEquivalent.toFixed(2)), 
      currency: "GHS",
      displayPrice: parseFloat(usdPrice.toFixed(2)), 
      displayCurrency: "USD",
    };
  }


  if (countryCode && LOCAL_OVERRIDES[countryCode]) {
    const override = LOCAL_OVERRIDES[countryCode];
    const localPrice = override[role] ?? ghsPrice;

    return {
      ghsPrice: parseFloat(localPrice.toFixed(2)), 
      localPrice: parseFloat(localPrice.toFixed(2)),
      currency: override.currency,
      displayPrice: parseFloat(localPrice.toFixed(2)),
      displayCurrency: override.currency,
    };
  }

  tier = (await getSchoolTier(schoolName)) || tier;

  if (pricingData.regional[countryCode]?.[role] != null) {
    ghsPrice = pricingData.regional[countryCode][role];
  } else if (tier === 3 || tier === 4) {
    ghsPrice = pricingData.tier3_4[role] ?? ghsPrice;
  }

  if (role === 'teacher' && pricingData.regional[countryCode]?.teacher_free) {
    ghsPrice = 0;
  }

  const currency = COUNTRY_CURRENCY_MAP[countryCode] || 'GHS';
  let localPrice = ghsPrice;

  if (currency !== 'GHS') {
    const rate = await getRate(currency).catch(() => null);
    if (!rate) {
      throw new Error("Currency conversion rate not available. Please try again later.");
    }
    localPrice = ghsPrice * rate;
  }

  return {
    ghsPrice: parseFloat(ghsPrice.toFixed(2)),
    localPrice: parseFloat(localPrice.toFixed(2)),
    currency,
    displayPrice: parseFloat(localPrice.toFixed(2)),
    displayCurrency: currency,
  };
}

module.exports = { getUserPrice };
