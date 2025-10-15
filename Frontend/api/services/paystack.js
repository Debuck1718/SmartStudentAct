import { initPaystackPayment } from "../../services/paystackService.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { email, ghsAmount } = req.body;

    if (!email || !ghsAmount) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const response = await initPaystackPayment({ email, ghsAmount });

    return res.status(200).json({
      success: true,
      message: "Paystack payment initialized successfully.",
      data: response,
    });
  } catch (error) {
    console.error("Paystack API Error:", error);
    return res.status(500).json({
      error: "Server Error",
      details: error.message,
    });
  }
}
