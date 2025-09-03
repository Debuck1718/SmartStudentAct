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
  default: { student: 1, teacher: 3, admin: 3 },   // USD baseline
  tier3_4: { student: 5, teacher: 10, admin: 10 }, // USD
  regional: {
    ZA: { student: 2, teacher: 5, admin: 7, teacher_free: true },
    ZM: { student: 2, teacher: 5, admin: 7, teacher_free: true },
    TN: { student: 2, teacher: 5, admin: 7, teacher_free: true },
    LY: { student: 2, teacher: 5, admin: 7, teacher_free: true },
    MA: { student: 3, teacher: 6, admin: 10, teacher_free: true },
  },
};

const LOCAL_OVERRIDES = {
  GH: { currency: 'GHS', student: 15, teacher: 50, admin: 70 },
  // Add more overrides per country if needed
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

async function getUserPrice(user, role, schoolName, schoolCountry) {
  if (!user) throw new Error("User data missing.");

  if (['overseer', 'global_overseer'].includes(role)) {
    return { usdPrice: 0, localPrice: 0, currency: 'USD' };
  }

  let usdPrice = pricingData.default[role] || 1; 
  let tier = 1;

  const countryCode = normalizeCountry(user, schoolCountry);

  // ✅ Check for hard local override (e.g. Ghana)
  if (countryCode && LOCAL_OVERRIDES[countryCode]) {
    const override = LOCAL_OVERRIDES[countryCode];
    const localPrice = override[role] ?? usdPrice;

    return {
      usdPrice,                     // keep USD baseline
      localPrice,                   // enforce local fixed price
      currency: override.currency,  // e.g. GHS
    };
  }

  // ✅ School-based tier adjustment
  try {
    if (schoolName) {
      const school = await School.findOne({ name: new RegExp(`^${schoolName}$`, 'i') });
      if (school && school.tier) tier = school.tier;
    }
  } catch (err) {
    logger.error("Error fetching school data:", err);
  }

  // ✅ Apply tier/region adjustments
  if (tier === 3 || tier === 4) {
    usdPrice = pricingData.tier3_4[role] ?? usdPrice;
  } else if (pricingData.regional[countryCode]?.[role] != null) {
    usdPrice = pricingData.regional[countryCode][role];
  }

  // ✅ Teacher free rule
  if (role === 'teacher' && pricingData.regional[countryCode]?.teacher_free) {
    usdPrice = 0;
  }

  // ✅ Currency handling
  const currency = COUNTRY_CURRENCY_MAP[countryCode] || 'USD';

  let localPrice = usdPrice;
  if (currency !== 'USD') {
    const rate = await getRate(currency).catch(() => null);
    if (rate != null) {
      localPrice = (usdPrice * rate).toFixed(2);
    }
  }

  return {
    usdPrice: usdPrice ?? 0,
    localPrice: parseFloat(localPrice) || 0,
    currency: currency || 'USD',
  };
}

module.exports = { getUserPrice };


