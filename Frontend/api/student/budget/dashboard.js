import dbConnect from "@/lib/db";
import BudgetEntry from "@/models/BudgetEntry";
import { authenticateJWT } from "@/middlewares/auth";
import checkSubscription from "@/middlewares/checkSubscription";
import logger from "@/utils/logger";

export default authenticateJWT(checkSubscription(async function handler(req, res) {
  await dbConnect();

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const entries = await BudgetEntry.find({ userId: req.user.id }).sort({ date: 1 });

    let totalIncome = 0, totalExpenses = 0;
    const spendingByCategory = {};
    const incomeByCategory = {};

    entries.forEach(({ amount, category, type }) => {
      if (type === "expense") {
        totalExpenses += amount;
        spendingByCategory[category] = (spendingByCategory[category] || 0) + amount;
      } else {
        totalIncome += amount;
        incomeByCategory[category] = (incomeByCategory[category] || 0) + amount;
      }
    });

    res.status(200).json({
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      spendingByCategory,
      incomeByCategory,
      entries,
    });
  } catch (err) {
    logger.error("Error loading budget dashboard:", err);
    res.status(500).json({ message: "Failed to load budget dashboard." });
  }
}));
