import dbConnect from "@/lib/db";
import BudgetEntry from "@/models/BudgetEntry";
import { authenticateJWT } from "@/middlewares/auth";
import checkSubscription from "@/middlewares/checkSubscription";
import logger from "@/utils/logger";
import eventBus from "@/utils/eventBus";

export default authenticateJWT(checkSubscription(async function handler(req, res) {
  await dbConnect();

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { amount, category, description, type, date } = req.body;

    if (!amount || !category || !type || !date) {
      return res.status(400).json({ message: "All required fields must be filled." });
    }

    const newEntry = new BudgetEntry({
      userId: req.user.id,
      amount,
      category,
      description: description || "",
      type,
      date: new Date(date),
    });

    await newEntry.save();

    eventBus.emit("budget_notification", {
      userId: req.user.id,
      message: `New ${type} entry for $${amount} has been added.`,
    });

    res.status(201).json({
      message: "Budget entry added successfully.",
      entry: newEntry,
    });
  } catch (err) {
    logger.error("Error adding budget entry:", err);
    res.status(500).json({ message: "Failed to add budget entry." });
  }
}));
