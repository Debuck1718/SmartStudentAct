import dbConnect from "@/lib/db";
import User from "@/models/User";
import School from "@/models/School";
import { authenticateJWT } from "@/middlewares/auth";
import { hasRole } from "@/middlewares/roles";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  await dbConnect();
  const user = await authenticateJWT(req);
  if (!user || !hasRole(user, ["global_overseer"])) return res.status(403).json({ message: "Forbidden" });

  try {
    const allRegions = await School.distinct("country");
    const overviewData = await Promise.all(
      allRegions.map(async (region) => {
        const schoolsInRegion = await School.find({ country: region });
        const schoolNames = schoolsInRegion.map((s) => s.name);
        const usersInSchools = await User.find({
          $or: [{ schoolName: { $in: schoolNames } }, { teacherSchool: { $in: schoolNames } }],
        });

        return {
          name: region,
          totalSchools: schoolNames.length,
          totalAdmins: usersInSchools.filter((u) => u.role === "admin").length,
          totalTeachers: usersInSchools.filter((u) => u.role === "teacher").length,
          totalStudents: usersInSchools.filter((u) => u.role === "student").length,
        };
      })
    );

    res.status(200).json({
      managedRegions: overviewData,
      totalUsers: await User.countDocuments(),
    });
  } catch (err) {
    console.error("Global overseer dashboard error:", err);
    res.status(500).json({ error: "Failed to retrieve dashboard data." });
  }
}
