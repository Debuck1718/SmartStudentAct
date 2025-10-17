import { connectDb } from "../../../Frontend/utils/connectDb";
import { authenticateJWT } from "../../middlewares/auth";
import User from "../../models/User";

export default async function handler(req, res) {
  await connectDb();
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  const user = await authenticateJWT(req);
  if (!user || !["admin", "overseer", "global_overseer"].includes(user.role)) return res.status(403).json({ message: "Forbidden" });

  try {
    const schools = await User.aggregate([
      { $project: { school: { $ifNull: ["$schoolName", "$teacherSchool"] } } },
      { $match: { school: { $ne: null } } },
      { $group: { _id: "$school" } },
    ]);
    res.json(schools.map((s) => s._id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to retrieve schools." });
  }
}
