// webhookController.js
const crypto = require('crypto');
const User = require('../models/User'); 
const secret = process.env.PAYSTACK_SECRET_KEY; 
const flutterwaveSecret = process.env.FLUTTERWAVE_SECRET_KEY;


const {
  sendPaymentReceiptEmail,
  sendSubscriptionRenewalEmail
} = require('../utils/email');


const processTransactionSuccess = async (userId, gateway, eventData) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      console.log('User not found for payment event.');
      return;
    }

    const updatedUser = await User.findByIdAndUpdate(
  userId,
  {
    $set: {
      subscriptionStatus: 'active',
      is_on_trial: false,
      paymentGateway: gateway,
      paymentDate: new Date(),
      nextBillingDate: eventData?.nextBillingDate || null,   // 👈 add this
    },
  },
  { new: true }
);


    console.log(`Subscription successfully activated for user: ${updatedUser._id}`);

    if (eventData && eventData.type === 'payment') {
      await sendPaymentReceiptEmail(
        updatedUser.email,
        updatedUser.firstname,
        eventData.planName || 'N/A',
        eventData.amount,
        eventData.date,
        eventData.transactionId,
        eventData.receiptLink
      );
      console.log('✅ Payment receipt email sent.');
    }


    if (eventData && eventData.type === 'renewal') {
      await sendSubscriptionRenewalEmail(
        updatedUser.email,
        updatedUser.firstname,
        eventData.planName || 'N/A',
        eventData.amount,
        eventData.nextBillingDate,
        eventData.manageLink
      );
      console.log('✅ Subscription renewal email sent.');
    }

  } catch (error) {
    console.error('Error updating database or sending email:', error);
  }
};


const handlePaystackWebhook = (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash === req.headers['x-paystack-signature']) {
      const event = req.body;

      if (event.event === 'charge.success') {
        const userId = event.data.metadata.user_id; 
        if (userId) {
          const eventData = {
            type: event.data.metadata.isRenewal ? 'renewal' : 'payment',
            planName: event.data.metadata.planName,
            amount: event.data.amount / 100, 
            date: new Date(event.data.paidAt),
            transactionId: event.data.reference,
            receiptLink: event.data.receipt_number ? `https://paystack.com/receipt/${event.data.receipt_number}` : null,
            nextBillingDate: event.data.metadata.nextBillingDate,
            manageLink: `${process.env.APP_URL}/account/billing`,
          };
          processTransactionSuccess(userId, 'paystack', eventData);
        } else {
          console.log('Paystack webhook data is missing user_id.');
        }
      } else {
        console.log(`Received unhandled Paystack event: ${event.event}`);
      }

      res.status(200).json({ status: 'ok' });
    } else {
      console.error('Paystack webhook verification failed: Invalid signature.');
      res.status(401).send('Invalid signature');
    }
  } catch (error) {
    console.error('Error processing Paystack webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


const handleFlutterwaveWebhook = (req, res) => {
  try {
    const providedHash = req.headers['verif-hash'];
    if (!providedHash || providedHash !== flutterwaveSecret) {
      console.error('Flutterwave webhook verification failed: Invalid secret.');
      res.status(401).send('Invalid signature');
      return;
    }

    const event = req.body;

    if (event.event === 'charge.completed' || event.event === 'transfer.completed') {
      const userId = event.data.meta.user_id; 
      if (userId) {
        const eventData = {
          type: event.data.meta.isRenewal ? 'renewal' : 'payment',
          planName: event.data.meta.planName,
          amount: event.data.amount,
          date: new Date(event.data.created_at),
          transactionId: event.data.tx_ref,
          receiptLink: event.data.flw_ref ? `https://flutterwave.com/receipt/${event.data.flw_ref}` : null,
          nextBillingDate: event.data.meta.nextBillingDate,
          manageLink: `${process.env.APP_URL}/account/billing`,
        };
        processTransactionSuccess(userId, 'flutterwave', eventData);
      } else {
        console.log('Flutterwave webhook data is missing user_id.');
      }
    } else {
      console.log(`Received unhandled Flutterwave event: ${event.event}`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing Flutterwave webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  handlePaystackWebhook,
  handleFlutterwaveWebhook,
};
