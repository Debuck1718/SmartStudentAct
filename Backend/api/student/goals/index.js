import dbConnect from "@/lib/db";
import StudentRewards from "@/models/StudentRewards";
import { authenticateJWT } from "@/middlewares/auth";
import logger from "@/utils/logger";

export default authenticateJWT(async function handler(req, res) {
  await dbConnect();
  const userId = req.user.id;

  try {
    switch (req.method) {
      // ✅ Create a new goal
      case "POST": {
        const { description, target, deadline } = req.body;

        if (!description || !target || !deadline) {
          return res.status(400).json({ message: "All fields are required." });
        }

        const student = await StudentRewards.findOne({ studentId: userId });
        if (!student) {
          return res.status(404).json({ message: "Student not found." });
        }

        const newGoal = {
          description,
          target,
          deadline: new Date(deadline),
          achieved: false,
          createdAt: new Date(),
        };

        student.goals.push(newGoal);
        await student.save();

        logger.info(`New goal added for user ${userId}`);
        return res.status(201).json({ message: "Goal created successfully.", goal: newGoal });
      }

      // ✅ Get all goals
      case "GET": {
        const student = await StudentRewards.findOne({ studentId: userId });
        if (!student) {
          return res.status(404).json({ message: "Student not found." });
        }

        return res.status(200).json(student.goals || []);
      }

      default:
        return res.status(405).json({ message: "Method not allowed" });
    }
  } catch (error) {
    logger.error("Error handling goals:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});
