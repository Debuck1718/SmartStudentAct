import { getUserPrice } from "../../services/pricingService.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { user, role, schoolName, schoolCountry } = req.body;

    if (!user || !role) {
      return res.status(400).json({ error: "Missing required fields: user or role" });
    }

    const priceInfo = await getUserPrice(user, role, schoolName, schoolCountry);

    return res.status(200).json({
      success: true,
      message: "Pricing calculated successfully.",
      data: priceInfo,
    });
  } catch (error) {
    console.error("Pricing API Error:", error);
    return res.status(500).json({
      error: "Server Error",
      details: error.message,
    });
  }
}
