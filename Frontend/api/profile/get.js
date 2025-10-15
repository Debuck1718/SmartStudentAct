import dbConnect from "@/lib/db";
import User from "@/models/User";
import School from "@/models/School";
import { authenticateJWT } from "@/middlewares/auth";
import { fromIsoCountryCode } from "@/utils/isoHelpers";

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    await dbConnect();
    const user = await authenticateJWT(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const foundUser = await User.findById(user._id)
      .populate("school", "schoolName schoolCountry")
      .select(
        "firstname lastname email phone occupation country school educationLevel grade university uniLevel program teacherGrade teacherSubject profile_picture_url"
      );

    if (!foundUser) return res.status(404).json({ message: "User not found." });

    // Simplify for worker occupation
    let userData;
    if (foundUser.occupation === "worker") {
      userData = {
        firstname: foundUser.firstname,
        lastname: foundUser.lastname,
        email: foundUser.email,
        phone: foundUser.phone,
        occupation: foundUser.occupation,
        country: foundUser.country || null,
        profile_picture_url: foundUser.profile_picture_url,
      };
    } else {
      userData = {
        ...foundUser.toObject(),
        school: foundUser.school
          ? {
              schoolName: foundUser.school.schoolName,
              schoolCountry: fromIsoCountryCode(foundUser.school.schoolCountry),
            }
          : null,
      };
    }

    res.status(200).json({ user: userData });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

