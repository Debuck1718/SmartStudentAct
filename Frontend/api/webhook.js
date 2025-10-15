import {
  handlePaystackWebhook,
  handleFlutterwaveWebhook,
} from "./controllers/webhookController.js";

export default async function handler(req, res) {
  const { gateway } = req.query;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (gateway === "paystack") {
    return handlePaystackWebhook(req, res);
  } else if (gateway === "flutterwave") {
    return handleFlutterwaveWebhook(req, res);
  } else {
    return res.status(400).json({ error: "Unknown gateway" });
  }
}
