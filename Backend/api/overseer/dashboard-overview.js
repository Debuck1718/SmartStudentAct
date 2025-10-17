import dbConnect from "@/lib/db";
import User from "@/models/User";
import School from "@/models/School";
import { authenticateJWT } from "@/middlewares/auth";
import { hasRole } from "@/middlewares/roles";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  await dbConnect();
  const user = await authenticateJWT(req);
  if (!user || !hasRole(user, ["overseer"])) return res.status(403).json({ message: "Forbidden" });

  const { managedRegions } = user;
  if (!managedRegions?.length) return res.json({ managedRegions: [] });

  try {
    const overviewData = await Promise.all(
      managedRegions.map(async (region) => {
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
    res.json({ managedRegions: overviewData });
  } catch (err) {
    console.error("Overseer dashboard error:", err);
    res.status(500).json({ error: "Failed to retrieve dashboard data." });
  }
}
