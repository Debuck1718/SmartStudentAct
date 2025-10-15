import dbConnect from "@/lib/db";
import User from "@/models/User";
import School from "@/models/School";
import { authenticateJWT } from "@/middlewares/auth";
import { settingsSchema } from "@/validation/schemas";
import { toIsoCountryCode, fromIsoCountryCode } from "@/utils/isoHelpers";

export default async function handler(req, res) {
  if (req.method !== "PATCH")
    return res.status(405).json({ message: "Method not allowed" });

  await dbConnect();
  const user = await authenticateJWT(req);
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  let updateData = req.body;

  try {
    const currentUser = await User.findById(user._id);
    if (!currentUser) return res.status(404).json({ message: "User not found." });

    const occupation = updateData.occupation || currentUser.occupation;

    // Handle fields by occupation
    if (occupation === "student") {
      updateData.teacherGrade = undefined;
      updateData.teacherSubject = undefined;
    } else if (["teacher", "admin"].includes(occupation)) {
      updateData.educationLevel = undefined;
      updateData.grade = undefined;
      updateData.university = undefined;
      updateData.uniLevel = undefined;
      updateData.program = undefined;
    } else if (occupation === "worker") {
      // Worker data: simple structure
      updateData.school = undefined;
      updateData.educationLevel = undefined;
      updateData.grade = undefined;
      updateData.university = undefined;
      updateData.uniLevel = undefined;
      updateData.program = undefined;
      updateData.teacherGrade = undefined;
      updateData.teacherSubject = undefined;
    }

    // Handle school assignment only for student/teacher/admin
    if (["student", "teacher", "admin"].includes(occupation)) {
      if (!updateData.school?.schoolName || !updateData.school?.schoolCountry) {
        return res.status(400).json({ message: "School name and country are required." });
      }
      const isoCountry = toIsoCountryCode(updateData.school.schoolCountry);
      let schoolDoc = await School.findOne({
        schoolName: updateData.school.schoolName,
        schoolCountry: isoCountry,
      });
      if (!schoolDoc)
        schoolDoc = await School.create({
          ...updateData.school,
          schoolCountry: isoCountry,
        });
      updateData.school = schoolDoc._id;
    } else {
      updateData.school = undefined;
    }

    // Validate email uniqueness
    if (updateData.email && updateData.email !== currentUser.email) {
      const existing = await User.findOne({ email: updateData.email });
      if (existing)
        return res.status(409).json({ message: "Email already in use." });
    }

    const updatedUser = await User.findByIdAndUpdate(user._id, updateData, {
      new: true,
      runValidators: true,
    }).populate("school");

    // Return simplified view for worker
    let userResponse;
    if (updatedUser.occupation === "worker") {
      userResponse = {
        firstname: updatedUser.firstname,
        lastname: updatedUser.lastname,
        email: updatedUser.email,
        phone: updatedUser.phone,
        occupation: updatedUser.occupation,
        country: updatedUser.country || null,
        profile_picture_url: updatedUser.profile_picture_url,
      };
    } else {
      userResponse = {
        ...updatedUser.toObject(),
        school: updatedUser.school
          ? {
              schoolName: updatedUser.school.schoolName,
              schoolCountry: fromIsoCountryCode(updatedUser.school.schoolCountry),
            }
          : null,
      };
    }

    res.status(200).json({
      message: "Profile updated successfully.",
      user: userResponse,
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
