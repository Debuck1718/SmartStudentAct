import express from "express";
import {
  handlePaystackWebhook,
  handleFlutterwaveWebhook,
} from "../controllers/webhookController.js";

const router = express.Router();

router.post("/webhooks/paystack", express.json(), handlePaystackWebhook);
router.post("/webhooks/flutterwave", express.json(), handleFlutterwaveWebhook);

export default router;

