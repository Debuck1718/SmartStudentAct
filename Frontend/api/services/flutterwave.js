import { initFlutterwavePayment } from "../../services/flutterwaveService.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email, amount, currency } = req.body;

    if (!email || !amount || !currency) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const paymentData = await initFlutterwavePayment({ email, amount, currency });

    if (!paymentData) {
      return res.status(500).json({ error: "Failed to initiate payment." });
    }

    return res.status(200).json({
      success: true,
      message: "Flutterwave payment initialized successfully.",
      data: paymentData,
    });
  } catch (error) {
    console.error("Flutterwave API Error:", error);
    return res.status(500).json({
      error: "Server Error",
      details: error.message,
    });
  }
}
