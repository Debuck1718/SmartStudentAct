// webhookController.js
// This file handles incoming webhook notifications from payment gateways.

const crypto = require('crypto');
const User = require('../models/User'); // Assuming a User model exists
const secret = process.env.PAYSTACK_SECRET_KEY; // Use environment variables for security.
const flutterwaveSecret = process.env.FLUTTERWAVE_SECRET_KEY;

// A single function to update the database, abstracting the business logic.
const processTransactionSuccess = async (userId, gateway) => {
    try {
        const user = await User.findById(userId);
        if (user && user.subscriptionStatus !== 'active') {
            // Update the user's subscription status to 'active'
            const updatedUser = await User.findByIdAndUpdate(
                userId, {
                    $set: {
                        subscriptionStatus: 'active',
                        is_on_trial: false, // Ensure trial is turned off
                        paymentGateway: gateway,
                        paymentDate: new Date()
                    }
                }, {
                    new: true
                } // Returns the updated document
            );

            console.log(`Subscription successfully activated for user: ${updatedUser._id}`);
            // You could also emit an event here to send a confirmation email, etc.
            // eventBus.emit('subscription_activated', updatedUser);
        } else {
            console.log('User not found or subscription is already active.');
        }
    } catch (error) {
        console.error('Error updating database:', error);
        // Implement a retry mechanism or log this to a dedicated error service.
    }
};

/**
 * Handles Paystack webhooks, verifying the signature before processing.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
const handlePaystackWebhook = (req, res) => {
    try {
        const hash = crypto
            .createHmac('sha512', secret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash === req.headers['x-paystack-signature']) {
            const event = req.body;
            if (event.event === 'charge.success') {
                const userId = event.data.metadata.user_id; // Assuming you pass user_id in metadata
                if (userId) {
                    processTransactionSuccess(userId, 'paystack');
                } else {
                    console.log('Paystack webhook data is missing user_id.');
                }
            } else {
                console.log(`Received unhandled Paystack event: ${event.event}`);
            }

            res.status(200).json({
                status: 'ok'
            });
        } else {
            console.error('Paystack webhook verification failed: Invalid signature.');
            res.status(401).send('Invalid signature');
        }
    } catch (error) {
        console.error('Error processing Paystack webhook:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
};

/**
 * Handles Flutterwave webhooks, verifying the signature before processing.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
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
            const userId = event.data.meta.user_id; // Assuming you pass user_id in meta
            if (userId) {
                processTransactionSuccess(userId, 'flutterwave');
            } else {
                console.log('Flutterwave webhook data is missing user_id.');
            }
        } else {
            console.log(`Received unhandled Flutterwave event: ${event.event}`);
        }

        res.status(200).json({
            status: 'ok'
        });
    } catch (error) {
        console.error('Error processing Flutterwave webhook:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
};

module.exports = {
    handlePaystackWebhook,
    handleFlutterwaveWebhook,
};
