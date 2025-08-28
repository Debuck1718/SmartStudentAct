const axios = require('axios');
const config = require('../config/paymentConfig');

async function initPaystackPayment(email, amount, currency) {

  const amountInKobo = Math.round(amount * 100);

  console.log(`Initiating Paystack payment for ${email}, amount: ${amountInKobo} (${currency}).`);

  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      { 
        email, 
        amount: amountInKobo, 
        currency 
      },
      { 
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.status === true) {
      return response.data.data; 
    } else {
      console.error('Paystack API returned a non-success status:', response.data);
      return null;
    }
  } catch (error) {
  
    console.error('Error initiating Paystack payment:', error.response ? error.response.data : error.message);
    return null;
  }
}

module.exports = { initPaystackPayment };

