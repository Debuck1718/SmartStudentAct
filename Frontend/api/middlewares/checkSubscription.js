import models from "../models/index.js";
const { User } = models;

export const checkSubscription = async (user, res) => {
  try {
    if (!user || !user.id) {
      return res.status(401).json({ message: "Unauthorized. User not authenticated." });
    }

    const dbUser = await User.findById(user.id);
    if (!dbUser) return res.status(404).json({ message: "User not found." });

    const now = new Date();
    const bypassRoles = ["overseer", "global_overseer"];
    if (bypassRoles.includes(dbUser.role)) return true;

    // Trial check
    if (dbUser.is_on_trial && dbUser.trial_end_at && dbUser.trial_end_at < now) {
      dbUser.is_on_trial = false;
      dbUser.subscription_status = "expired";
      await dbUser.save();

      return res.status(403).json({
        message: "Your free trial has expired. Please subscribe to continue.",
      });
    }

    // Active subscription check
    if (dbUser.subscription_status === "active" && dbUser.payment_date) {
      const expiryDate = new Date(dbUser.payment_date);
      expiryDate.setMonth(expiryDate.getMonth() + 1);

      if (now > expiryDate) {
        dbUser.subscription_status = "expired";
        await dbUser.save();
        return res.status(403).json({
          message: "Your subscription has expired. Please renew to continue.",
        });
      }
    }

    if (dbUser.subscription_status === "active" || dbUser.is_on_trial) {
      return true;
    }

    return res.status(403).json({
      message: "Access denied. You do not have an active subscription.",
    });
  } catch (err) {
    console.error("Error in checkSubscription middleware:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
};
