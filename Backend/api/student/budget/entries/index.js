import dbConnect from "@/lib/db";
import BudgetEntry from "@/models/BudgetEntry";
import { authenticateJWT } from "@/middlewares/auth";
import logger from "@/utils/logger";

export default authenticateJWT(async function handler(req, res) {
  await dbConnect();

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const entries = await BudgetEntry.find({ userId: req.user.id }).sort({ date: -1 });
    res.status(200).json({ entries });
  } catch (err) {
    logger.error("Error fetching budget entries:", err);
    res.status(500).json({ message: "Failed to fetch budget entries." });
  }
});
