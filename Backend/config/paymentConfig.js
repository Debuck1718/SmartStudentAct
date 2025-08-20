// In config/paymentConfig.js

// This file centralizes all payment gateway configuration,
// making it easy to manage and update. All sensitive keys
// are loaded from environment variables for security.

module.exports = {
  paystack: {
    // Public key is for client-side use (e.g., in the mobile app)
    publicKey: process.env.PAYSTACK_PUBLIC_KEY,
    // Secret key is for server-side use (e.g., webhook verification)
    secretKey: process.env.PAYSTACK_SECRET_KEY,
  },
  flutterwave: {
    // Public key for client-side forms
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    // Secret key for server-side webhook verification
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    // The redirect URL for the client after payment is completed.
    // Using an environment variable makes it easy to switch between
    // development (e.g., localhost) and production URLs.
    redirectURL: process.env.FLUTTERWAVE_REDIRECT_URL,
  },
  // A mapping of country codes to currencies. This is a good way to
  // centralize business logic.
  currencyMap: {
    GH: 'GHS',
    ZA: 'ZAR',
    ZM: 'ZMW',
    US: 'USD',
    GB: 'GBP'
  }
};