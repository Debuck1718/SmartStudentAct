// api/leaderboard.js
import { connectDB } from "@/lib/db.js";
import models from "@/models/index.js";
import { authenticateJWT } from "@/middlewares/auth.js";
import logger from "@/utils/logger.js";

export default async function handler(req, res) {
  await connectDB();

  try {
    const authResult = await authenticateJWT(req, res);
    if (!authResult?.user) return;

    const { level } = req.query; 
    const userId = req.user.id;
    const { StudentRewards, WorkerRewards } = models;

    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }


    const studentAgg = await StudentRewards.aggregate([
      {
        $addFields: {
          totalPoints: {
            $sum: "$pointsLog.points",
          },
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$studentId",
          name: 1,
          level: "$level",
          totalPoints: 1,
          category: { $literal: "Student" },
        },
      },
    ]);


    const workerAgg = await WorkerRewards.aggregate([
      {
        $addFields: {
          totalPoints: {
            $sum: "$pointsLog.points",
          },
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$workerId",
          name: 1,
          level: { $literal: "Worker" },
          totalPoints: 1,
          category: { $literal: "Worker" },
        },
      },
    ]);


    let combined = [...studentAgg, ...workerAgg];


    if (level) {
      combined = combined.filter(
        (u) => u.level?.toLowerCase() === level.toLowerCase()
      );
    }


    combined.sort((a, b) => b.totalPoints - a.totalPoints);
    const ranked = combined.map((u, i) => ({
      rank: i + 1,
      ...u,
    }));


    const userRank =
      ranked.findIndex((u) => String(u.userId) === String(userId)) + 1;

    return res.status(200).json({
      message: "Global leaderboard fetched successfully.",
      leaderboard: ranked.slice(0, 20), 
      yourRank: userRank > 0 ? userRank : "Unranked",
    });
  } catch (err) {
    logger.error("Error in leaderboard route:", err);
    return res.status(500).json({
      message: "Failed to fetch leaderboard.",
      error: err.message,
    });
  }
}
