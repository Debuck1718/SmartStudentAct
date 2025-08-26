
const School = require('../models/School');
const { getRate } = require('../utils/currencyConverter');
const logger = require('../utils/logger'); 

const COUNTRY_CURRENCY_MAP = {
    // North Africa
    'DZ': 'DZD', // Algeria (Dinar)
    'EG': 'EGP', // Egypt (Pound)
    'LY': 'LYD', // Libya (Dinar)
    'MA': 'MAD', // Morocco (Dirham)
    'TN': 'TND', // Tunisia (Dinar)

    // West Africa
    'BJ': 'XOF', 
    'BF': 'XOF', 
    'CI': 'XOF', 
    'GM': 'GMD', 
    'GH': 'GHS', 
    'GW': 'XOF', 
    'GN': 'GNF', 
    'ML': 'XOF', 
    'MR': 'MRO', 
    'NE': 'XOF', 
    'NG': 'NGN', 
    'SN': 'XOF', 
    'SL': 'SLL', 
    'TG': 'XOF', 

    // Central Africa
    'AO': 'AOA', 
    'CM': 'XAF', 
    'CF': 'XAF', 
    'TD': 'XAF', 
    'CG': 'XAF', 
    'CD': 'CDF', 
    'GQ': 'XAF', 
    'GA': 'XAF', 

    // East Africa
    'BI': 'BIF', // Burundi (Burundi Franc)
    'DJ': 'DJF', // Djibouti (Djibouti Franc)
    'ER': 'ERN', // Eritrea (Eritrean Nakfa)
    'ET': 'ETB', // Ethiopia (Birr)
    'KE': 'KES', // Kenya (Shillings)
    'RW': 'RWF', // Rwanda (Franc)
    'SO': 'SOS', // Somalia (Shillings)
    'SS': 'SSP', // South Sudan (Pound)
    'SD': 'SDG', // Sudan (Pound)
    'TZ': 'TZS', // Tanzania (Shillings)
    'UG': 'UGX', // Uganda (Shillings)

    // Southern Africa
    'BW': 'BWP', // Botswana (Pula)
    'KM': 'KMF', // Comoros (Comoros Franc)
    'LS': 'LSL', // Lesotho (Loti)
    'MG': 'MGA', // Madagascar (Malagasy ariary)
    'MW': 'MWK', // Malawi (Kwacha)
    'MU': 'MUR', // Mauritius (Rupees)
    'MZ': 'MZN', // Mozambique (Metical)
    'NA': 'NAD', // Namibia (Dollar)
    'SC': 'SCR', // Seychelles (Rupees)
    'ZA': 'ZAR', // South Africa (Rand)
    'SZ': 'SZL', // Eswatini (Swaziland) (Lilangeni)
    'ZM': 'ZMW', // Zambia (Kwacha)
    'ZW': 'ZWD', // Zimbabwe (Dollar)

    // Other countries or defaults can be added here
};

const pricingData = {
    default: {
        student: 1,
        teacher: 3,
        admin: 3,
    },
    tier3_4: { 
        student: 5,
        teacher: 10,
        admin: 10,
    },
    regional: { // Special pricing for specific countries or regions
        ZA: { student: 2, teacher: 5, teacher_free: true },
        ZM: { student: 2, teacher: 5, teacher_free: true },
        TN: { student: 2, teacher: 5, teacher_free: true },
        LY: { student: 2, teacher: 5, teacher_free: true },
        MA: { student: 3, teacher: 6, teacher_free: true },
    },
};

/**
 * Retrieves the local and USD price for a user based on their role, country, and school.
 *
 * @param {string} countryCode - The country code of the user (e.g., 'ZA', 'GH').
 * @param {string} role - The user's role (e.g., 'student', 'teacher', 'overseer').
 * @param {string} schoolName - The name of the user's school.
 * @returns {Promise<object>} An object containing usdPrice, localPrice, and currency.
 */
async function getUserPrice(countryCode, role, schoolName) {
    // 1. First, handle roles that should not pay anything.
    if (['overseer', 'global_overseer'].includes(role)) {
        return { usdPrice: 0, localPrice: 0, currency: 'USD' };
    }

    let usdPrice = 0;
    let tier = 1;

    try {
        if (schoolName) {
            // Use a case-insensitive regular expression to find the school.
            const school = await School.findOne({ name: new RegExp(`^${schoolName}$`, 'i') });
            if (school && school.tier) {
                tier = school.tier;
            }
        }
    } catch (error) {
        logger.error('Error fetching school data:', error);
        // Continue with default tier if database call fails.
    }

    if (tier === 3 || tier === 4) {
        usdPrice = pricingData.tier3_4[role];
    } 
    // Regional pricing has the next priority.
    else if (pricingData.regional[countryCode]) {
        usdPrice = pricingData.regional[countryCode][role];
    }
    // Default pricing is the final fallback.
    else {
        usdPrice = pricingData.default[role];
    }

    if (!usdPrice) {
        usdPrice = pricingData.default.teacher;
    }


    if (role === 'teacher' && pricingData.regional[countryCode] && pricingData.regional[countryCode].teacher_free) {
        usdPrice = 0;
    }

    const currency = COUNTRY_CURRENCY_MAP[countryCode] || 'USD';
    const rate = await getRate(currency);
    const localPrice = rate ? (usdPrice * rate).toFixed(2) : usdPrice;

    return {
        usdPrice,
        localPrice: parseFloat(localPrice),
        currency
    };
}

module.exports = { getUserPrice };