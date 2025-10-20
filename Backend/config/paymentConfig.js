export default {
  paystack: {

    publicKey: process.env.PAYSTACK_PUBLIC_KEY,

    secretKey: process.env.PAYSTACK_SECRET_KEY,
  },

  flutterwave: {
    
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
    redirectURL: process.env.FLUTTERWAVE_REDIRECT_URL,
  },

  currencyMap: {
    GH: "GHS",
    ZA: "ZAR",
    ZM: "ZMW",
    US: "USD",
    GB: "GBP",
  },
};
