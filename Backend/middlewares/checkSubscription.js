const User = require('../models/User'); // Assuming your user model is in ../models/user.js

const checkSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id); // Assuming user ID is available from a previous authentication middleware

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const now = new Date();

    // Check if the trial has expired AND the subscription is not active
    if (user.is_on_trial && user.trial_end_date < now) {
      // The trial has expired. Update the user's status in the database.
      // This is a good place to trigger a notification or set a new status.
      // For now, we'll just return an error.
      user.is_on_trial = false;
      user.subscription_status = 'expired';
      await user.save();
      return res.status(403).json({ message: 'Your free trial has expired. Please subscribe to continue.' });
    }
    
    // Check if the user is on a paid plan
    if (user.subscription_status === 'active') {
        // User has a valid subscription, proceed to the next middleware or route handler.
        next();
    } else if (user.is_on_trial) {
        // User is still within the trial period, proceed.
        next();
    } else {
        // User is not on a trial and does not have an active subscription.
        return res.status(403).json({ message: 'Access denied. You do not have an active subscription.' });
    }
    
  } catch (err) {
    console.error('Error in checkSubscription middleware:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = checkSubscription;
