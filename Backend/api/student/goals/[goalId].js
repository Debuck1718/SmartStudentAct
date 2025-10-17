import dbConnect from "@/lib/db";
import StudentRewards from "@/models/StudentRewards";
import { authenticateJWT } from "@/middlewares/auth";
import logger from "@/utils/logger";

export default authenticateJWT(async function handler(req, res) {
  await dbConnect();
  const userId = req.user.id;
  const { goalId } = req.query;

  try {
    const student = await StudentRewards.findOne({ studentId: userId });
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    switch (req.method) {
      // ✅ Update goal
      case "PUT": {
        const { description, target, deadline, achieved } = req.body;
        const goal = student.goals.id(goalId);

        if (!goal) {
          return res.status(404).json({ message: "Goal not found." });
        }

        if (description) goal.description = description;
        if (target) goal.target = target;
        if (deadline) goal.deadline = new Date(deadline);
        if (achieved !== undefined) goal.achieved = achieved;

        await student.save();

        logger.info(`Goal ${goalId} updated for user ${userId}`);
        return res.status(200).json({ message: "Goal updated successfully.", goal });
      }

      // ✅ Delete goal
      case "DELETE": {
        const goal = student.goals.id(goalId);
        if (!goal) {
          return res.status(404).json({ message: "Goal not found." });
        }

        goal.remove();
        await student.save();

        logger.info(`Goal ${goalId} deleted for user ${userId}`);
        return res.status(200).json({ message: "Goal deleted successfully." });
      }

      default:
        return res.status(405).json({ message: "Method not allowed" });
    }
  } catch (error) {
    logger.error("Error updating/deleting goal:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});
