// services/pricingService.js
// This module provides a flexible and robust way to determine user pricing.

const School = require('../models/School');
const { getRate } = require('../utils/currencyConverter');
const logger = require('../utils/logger'); // Assuming a logger utility is available

// --- Country-to-Currency Mapping for Africa ---
// This map ensures that we always get the correct local currency for a given country.
const COUNTRY_CURRENCY_MAP = {
    // North Africa
    'DZ': 'DZD', // Algeria (Dinar)
    'EG': 'EGP', // Egypt (Pound)
    'LY': 'LYD', // Libya (Dinar)
    'MA': 'MAD', // Morocco (Dirham)
    'TN': 'TND', // Tunisia (Dinar)

    // West Africa
    'BJ': 'XOF', // Benin (CFA Franc)
    'BF': 'XOF', // Burkina Faso (CFA Franc)
    'CI': 'XOF', // Cote d’Ivoire (CFA Franc)
    'GM': 'GMD', // Gambia (Dalasi)
    'GH': 'GHS', // Ghana (Cedi)
    'GW': 'XOF', // Guinea-Bissau (CFA Franc) - Note: The old GWP is deprecated
    'GN': 'GNF', // Guinea (Franc)
    'ML': 'XOF', // Mali (CFA Franc)
    'MR': 'MRO', // Mauritania (Ouguiya) - Note: The old MRO is deprecated, now MRU is used
    'NE': 'XOF', // Niger (CFA Franc)
    'NG': 'NGN', // Nigeria (Naira)
    'SN': 'XOF', // Senegal (CFA Franc)
    'SL': 'SLL', // Sierra Leone (Leone)
    'TG': 'XOF', // Togo (CFA Franc)

    // Central Africa
    'AO': 'AOA', // Angola (Kwanza)
    'CM': 'XAF', // Cameroon (CFA Franc BEAC)
    'CF': 'XAF', // Central African Republic (CFA Franc)
    'TD': 'XAF', // Chad (CFA Franc)
    'CG': 'XAF', // Republic of the Congo (CFA Franc)
    'CD': 'CDF', // DR Congo (Francs)
    'GQ': 'XAF', // Equatorial Guinea (CFA Franc BEAC)
    'GA': 'XAF', // Gabon (CFA Franc)

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

// --- PRICING DATA IN USD ---
// These are the base prices for different roles and school tiers.
const pricingData = {
    default: {
        student: 1,
        teacher: 3,
        admin: 3,
    },
    tier3_4: { // Premium pricing
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

    // 2. Determine the base USD price using a clean, prioritized lookup.
    // Tier 3 or 4 pricing has the highest priority.
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

    // 3. Handle specific edge cases and ensure a default is always set.
    // If a price wasn't found for the specific role, use the default for a teacher.
    if (!usdPrice) {
        usdPrice = pricingData.default.teacher;
    }

    // A teacher in a region with special pricing should get their price for that region.
    // We handle the `teacher_free` case as a separate, final check.
    if (role === 'teacher' && pricingData.regional[countryCode] && pricingData.regional[countryCode].teacher_free) {
        usdPrice = 0;
    }

    // 4. Get the local currency and perform the conversion.
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