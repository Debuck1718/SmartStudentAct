// routes/webhookRoutes.js
const express = require("express");
const router = express.Router();
const { handlePaystackWebhook, handleFlutterwaveWebhook } = require("../controllers/webhookController");

router.post("/webhooks/paystack", express.json(), handlePaystackWebhook);
router.post("/webhooks/flutterwave", express.json(), handleFlutterwaveWebhook);

module.exports = router;
