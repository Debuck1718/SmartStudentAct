// In config/paymentConfig.js

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
   
    redirectURL: process.env.FLUTTERWAVE_REDIRECT_URL,
  },

  currencyMap: {
    GH: 'GHS',
    ZA: 'ZAR',
    ZM: 'ZMW',
    US: 'USD',
    GB: 'GBP'
  }
};