import User from "../models/User.js";

const checkSubscription = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ message: "Unauthorized. User not authenticated." });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const now = new Date();

    // 🚀 Always allow overseer/global_overseer to bypass subscription check
    if (["overseer", "global_overseer"].includes(user.role)) {
      return next();
    }

    // 🕒 Handle trial expiration
    if (user.is_on_trial && user.trial_end_at && user.trial_end_at < now) {
      // Avoid running schema validators which require payment fields
      await User.updateOne({ _id: user._id }, { $set: { is_on_trial: false, subscription_status: 'expired' } }, { runValidators: false });

      console.info(`Trial expired for user ${user._id} at ${now.toISOString()}`);

      return res.status(403).json({
        message: "Your free trial has expired. Please subscribe to continue.",
      });
    }

    // 💳 Handle subscription expiration
    if (user.subscription_status === "active" && user.payment_date) {
      const expiryDate = new Date(user.payment_date);
      expiryDate.setMonth(expiryDate.getMonth() + 1);

      if (now > expiryDate) {
        await User.updateOne({ _id: user._id }, { $set: { subscription_status: 'expired' } }, { runValidators: false });

        console.info(
          `Subscription expired for user ${user._id} at ${now.toISOString()}`
        );

        return res.status(403).json({
          message: "Your subscription has expired. Please renew to continue.",
        });
      }
    }


    if (user.subscription_status === "active" || user.is_on_trial) {
      return next();
    }


    return res.status(403).json({
      message: "Access denied. You do not have an active subscription.",
    });
  } catch (err) {
    console.error("Error in checkSubscription middleware:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};

export default checkSubscription;

