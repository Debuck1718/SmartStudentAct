// api/student/milestones.js
import dbConnect from "@/lib/db";
import StudentRewards from "@/models/StudentRewards";
import Reward from "@/models/Reward";
import User from "@/models/User";
import { authenticateJWT } from "@/middlewares/auth";
import logger from "@/utils/logger";

export default async function handler(req, res) {
  await dbConnect();
  await authenticateJWT(req, res);

  const userId = req.userId;

  try {
    // 🔹 View individual milestones and rewards
    if (req.method === "GET") {
      const { view } = req.query;

      // If user wants leaderboard
      if (view === "leaderboard") {
        const leaderboard = await StudentRewards.aggregate([
          {
            $addFields: {
              totalPoints: { $sum: "$pointsLog.points" }
            }
          },
          { $sort: { totalPoints: -1 } },
          { $limit: 10 }, // top 10 students
          {
            $lookup: {
              from: "users",
              localField: "studentId",
              foreignField: "_id",
              as: "userInfo"
            }
          },
          { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              studentId: 1,
              name: "$name",
              level: 1,
              totalPoints: 1,
              consistentMonths: 1,
              termPercentage: 1,
              userEmail: "$userInfo.email",
            }
          }
        ]);

        // find logged in user’s rank
        const allStudents = await StudentRewards.aggregate([
          { $addFields: { totalPoints: { $sum: "$pointsLog.points" } } },
          { $sort: { totalPoints: -1 } }
        ]);

        const rank =
          allStudents.findIndex((s) => String(s.studentId) === String(userId)) +
          1;

        return res.status(200).json({
          message: "Leaderboard fetched successfully.",
          leaderboard,
          yourRank: rank > 0 ? rank : "Unranked",
        });
      }

      // Otherwise, return personal milestones
      const studentRewards = await StudentRewards.findOne({ studentId: userId });
      if (!studentRewards) {
        return res.status(404).json({ message: "No rewards or milestones found for this student." });
      }

      const rewards = await Reward.find({ user_id: userId }).sort({ granted_at: -1 });

      return res.status(200).json({
        student: studentRewards,
        rewards,
        summary: {
          totalPoints: studentRewards.pointsLog.reduce((sum, log) => sum + log.points, 0),
          totalBadges: rewards.length,
          consistentMonths: studentRewards.consistentMonths,
          termPercentage: studentRewards.termPercentage,
        },
      });
    }

    // 🔹 Record a milestone
    if (req.method === "POST") {
      const { milestoneType, description } = req.body;

      if (!milestoneType) {
        return res.status(400).json({ message: "Milestone type is required." });
      }

      const studentRewards = await StudentRewards.findOne({ studentId: userId });
      if (!studentRewards) {
        return res.status(404).json({ message: "Student record not found." });
      }

      let rewardType = "Custom";
      let rewardPoints = 0;

      switch (milestoneType) {
        case "goal_streak":
          rewardType = "Goal Crusher";
          rewardPoints = 100;
          studentRewards.consistentMonths += 1;
          break;
        case "budget_master":
          rewardType = "Budget Boss";
          rewardPoints = 80;
          studentRewards.weeklyBudgetMet = true;
          break;
        case "assignment_pro":
          rewardType = "Assignment Ace";
          rewardPoints = 120;
          studentRewards.weeklyAssignmentsDone = true;
          break;
        case "academic_top":
          rewardType = "Top Scholar";
          rewardPoints = 150;
          studentRewards.termPercentage = Math.min(100, studentRewards.termPercentage + 10);
          break;
        default:
          rewardType = "Custom";
          rewardPoints = 50;
      }

      const newReward = new Reward({
        user_id: userId,
        type: rewardType,
        points: rewardPoints,
        description: description || `Milestone achieved: ${milestoneType}`,
        granted_by: userId,
      });

      await newReward.save();

      studentRewards.pointsLog.push({
        points: rewardPoints,
        source: "Milestone",
        description: description || rewardType,
      });

      await studentRewards.save();

      return res.status(201).json({
        message: `Milestone recorded successfully! You earned the ${rewardType} badge.`,
        reward: newReward,
      });
    }

    // 🔹 Clear milestones (reset)
    if (req.method === "DELETE") {
      await Reward.deleteMany({ user_id: userId });
      await StudentRewards.updateOne(
        { studentId: userId },
        { $set: { pointsLog: [], consistentMonths: 0, termPercentage: 0 } }
      );

      return res.status(200).json({ message: "Milestones and rewards cleared." });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    logger.error("Error in milestone route:", err);
    return res.status(500).json({ message: "Server error in milestone route.", error: err.message });
  }
}
