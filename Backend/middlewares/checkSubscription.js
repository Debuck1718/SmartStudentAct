const User = require('../models/User'); // Assuming your user model is in ../models/User.js

const checkSubscription = async (req, res, next) => {
  try {
    // 🔒 Defensive check
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized. User not authenticated.' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const now = new Date();

    // ⏳ Trial expired
    if (user.is_on_trial && user.trial_end_date && user.trial_end_date < now) {
      user.is_on_trial = false;
      user.subscription_status = 'expired';
      await user.save();

      return res.status(403).json({
        message: 'Your free trial has expired. Please subscribe to continue.',
      });
    }

    // ✅ Valid subscription or trial still active
    if (user.subscription_status === 'active' || user.is_on_trial) {
      return next();
    }

    // ❌ No valid subscription
    return res.status(403).json({
      message: 'Access denied. You do not have an active subscription.',
    });
  } catch (err) {
    console.error('Error in checkSubscription middleware:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = checkSubscription;
