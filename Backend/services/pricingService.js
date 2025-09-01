const School = require('../models/School');
const { getRate } = require('../utils/currencyConverter');
const logger = require('../utils/logger');

const COUNTRY_CURRENCY_MAP = {
  // North Africa
  DZ: 'DZD', EG: 'EGP', LY: 'LYD', MA: 'MAD', TN: 'TND',
  // West Africa
  BJ: 'XOF', BF: 'XOF', CI: 'XOF', GM: 'GMD', GH: 'GHS', GW: 'XOF',
  GN: 'GNF', ML: 'XOF', MR: 'MRO', NE: 'XOF', NG: 'NGN', SN: 'XOF',
  SL: 'SLL', TG: 'XOF',
  // Central Africa
  AO: 'AOA', CM: 'XAF', CF: 'XAF', TD: 'XAF', CG: 'XAF', CD: 'CDF',
  GQ: 'XAF', GA: 'XAF',
  // East Africa
  BI: 'BIF', DJ: 'DJF', ER: 'ERN', ET: 'ETB', KE: 'KES', RW: 'RWF',
  SO: 'SOS', SS: 'SSP', SD: 'SDG', TZ: 'TZS', UG: 'UGX',
  // Southern Africa
  BW: 'BWP', KM: 'KMF', LS: 'LSL', MG: 'MGA', MW: 'MWK', MU: 'MUR',
  MZ: 'MZN', NA: 'NAD', SC: 'SCR', ZA: 'ZAR', SZ: 'SZL', ZM: 'ZMW',
  ZW: 'ZWD',
};

const pricingData = {
  default: { student: 1, teacher: 3, admin: 3 },
  tier3_4: { student: 5, teacher: 10, admin: 10 },
  regional: {
    ZA: { student: 2, teacher: 5, teacher_free: true },
    ZM: { student: 2, teacher: 5, teacher_free: true },
    TN: { student: 2, teacher: 5, teacher_free: true },
    LY: { student: 2, teacher: 5, teacher_free: true },
    MA: { student: 3, teacher: 6, teacher_free: true },
  },
};

// Normalize country from schoolCountry or fallback to user.country
function normalizeCountry(user) {
  let code = user?.schoolCountry || user?.country;
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

async function getUserPrice(user, role, schoolName) {
  if (!user) throw new Error("User object is required.");
  if (!role) role = user.role || 'student';

  if (['overseer', 'global_overseer'].includes(role)) {
    return { usdPrice: 0, localPrice: 0, currency: 'USD' };
  }

  let usdPrice = 0;
  let tier = 1;

  const countryCode = normalizeCountry(user);
  if (!countryCode) throw new Error("User country not found.");

  try {
    if (schoolName) {
      const school = await School.findOne({ name: new RegExp(`^${schoolName}$`, 'i') });
      if (school && school.tier) tier = school.tier;
    }
  } catch (error) {
    logger.error('Error fetching school data:', error);
  }

  // Determine base USD price
  if (tier === 3 || tier === 4) {
    usdPrice = pricingData.tier3_4[role] || pricingData.default[role];
  } else if (pricingData.regional[countryCode]) {
    usdPrice = pricingData.regional[countryCode][role] ?? pricingData.default[role];
  } else {
    usdPrice = pricingData.default[role];
  }

  // Apply teacher-free condition
  if (role === 'teacher' && pricingData.regional[countryCode]?.teacher_free) {
    usdPrice = 0;
  }

  const currency = COUNTRY_CURRENCY_MAP[countryCode] || 'USD';
  const rate = await getRate(currency);

  const localPrice = (rate && !isNaN(rate)) ? parseFloat((usdPrice * rate).toFixed(2)) : usdPrice;

  return {
    usdPrice,
    localPrice,
    currency,
  };
}

module.exports = { getUserPrice };
