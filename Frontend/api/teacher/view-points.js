// api/teacher/view-points.js
import dbConnect from "@/lib/db";
import User from "@/models/User";
import StudentRewards from "@/models/StudentRewards";
import { authenticateJWT } from "@/middlewares/auth";
import logger from "@/utils/logger";

export default async function handler(req, res) {
  await dbConnect();
  await authenticateJWT(req, res);

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { studentId } = req.query;

  try {
    const student = await User.findById(studentId).select("firstname lastname smart_points");
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    const studentRewards = await StudentRewards.findOne({ studentId });

    return res.status(200).json({
      student: {
        id: student._id,
        name: `${student.firstname} ${student.lastname}`,
        smart_points: student.smart_points || 0,
      },
      pointsLog: studentRewards ? studentRewards.pointsLog : [],
    });
  } catch (error) {
    logger.error("Error fetching student points:", error);
    return res.status(500).json({ message: "Failed to fetch student points." });
  }
}
