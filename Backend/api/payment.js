import { initializePayment } from "./controllers/paymentController.js";
import { authenticateUser } from "./middlewares/auth.js"; // if using auth middleware

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Optionally add auth if you're protecting this route
    await authenticateUser(req, res);

    await initializePayment(req, res);
  } catch (err) {
    console.error("Payment init error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
