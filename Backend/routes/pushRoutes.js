
const express = require("express");
const router = express.Router();
const User = require("../models/User"); 
const { authenticateJWT } = require("../middlewares/auth"); 

router.post("/push/subscribe", authenticateJWT, async (req, res) => {
  try {
    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: "Invalid subscription object" });
    }


    await User.findByIdAndUpdate(req.user.id, {
      PushSub: subscription,
    });

    res.status(201).json({ message: "Push subscription saved" });
  } catch (err) {
    console.error("❌ Failed to save push subscription:", err.message);
    res.status(500).json({ message: "Failed to save push subscription" });
  }
});

module.exports = router;
