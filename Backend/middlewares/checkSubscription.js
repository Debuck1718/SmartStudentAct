const User = require('../models/User');

const checkSubscription = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized. User not authenticated.' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const now = new Date();

    if (user.is_on_trial && user.trial_ends_at && user.trial_ends_at < now) {
      user.is_on_trial = false;
      user.subscription_status = 'expired'; 
      await user.save();

      console.info(`Trial expired for user ${user._id} at ${now.toISOString()}`);

      return res.status(403).json({
        message: 'Your free trial has expired. Please subscribe to continue.',
      });
    }

   
    if (user.subscription_status === 'active' && user.payment_date) {
      const expiryDate = new Date(user.payment_date);
      expiryDate.setMonth(expiryDate.getMonth() + 1); 
      if (now > expiryDate) {
        user.subscription_status = 'expired';
        await user.save();
        console.info(`Subscription expired for user ${user._id} at ${now.toISOString()}`);
        return res.status(403).json({
          message: 'Your subscription has expired. Please renew to continue.',
        });
      }
    }


    if (user.subscription_status === 'active' || user.is_on_trial) {
      return next();
    }

    return res.status(403).json({
      message: 'Access denied. You do not have an active subscription.',
    });
  } catch (err) {
    console.error('Error in checkSubscription middleware:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = checkSubscription;
