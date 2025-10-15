import dbConnect from "@/lib/db";
import BudgetEntry from "@/models/BudgetEntry";
import { authenticateJWT } from "@/middlewares/auth";
import logger from "@/utils/logger";
import eventBus from "@/utils/eventBus";

export default authenticateJWT(async function handler(req, res) {
  await dbConnect();
  const { entryId } = req.query;
  const userId = req.user.id;

  try {
    switch (req.method) {
      // GET
      case "GET": {
        const entry = await BudgetEntry.findOne({ _id: entryId, userId });
        if (!entry) return res.status(404).json({ message: "Budget entry not found." });
        return res.status(200).json({ entry });
      }

      // PUT
      case "PUT": {
        const updatedEntry = await BudgetEntry.findOneAndUpdate(
          { _id: entryId, userId },
          { $set: req.body },
          { new: true }
        );

        if (!updatedEntry) return res.status(404).json({ message: "Budget entry not found." });

        return res.status(200).json({
          message: "Budget entry updated successfully.",
          entry: updatedEntry,
        });
      }

      // DELETE
      case "DELETE": {
        const deletedEntry = await BudgetEntry.findOneAndDelete({ _id: entryId, userId });
        if (!deletedEntry) return res.status(404).json({ message: "Budget entry not found." });

        eventBus.emit("budget_notification", {
          userId,
          message: `A ${deletedEntry.type} entry has been deleted.`,
        });

        return res.status(200).json({ message: "Budget entry deleted successfully." });
      }

      default:
        return res.status(405).json({ message: "Method not allowed" });
    }
  } catch (err) {
    logger.error("Error handling budget entry:", err);
    res.status(500).json({ message: "Server error." });
  }
});
