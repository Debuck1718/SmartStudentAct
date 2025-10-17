import dbConnect from "@/lib/db";
import User from "@/models/User";
import { authenticateJWT } from "@/middlewares/auth";
import { settingsSchema } from "@/validation/schemas";

export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });

  try {
    await dbConnect();
    const user = await authenticateJWT(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const updateData = req.body;
    const { error } = settingsSchema.validate(updateData);
    if (error) return res.status(400).json({ message: error.details[0].message });

    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await User.findOne({ email: updateData.email });
      if (existingUser) return res.status(409).json({ message: "Email already in use." });
    }

    const result = await User.updateOne({ _id: user._id }, updateData);
    res.status(200).json({
      message: result.modifiedCount > 0 ? "Settings updated successfully." : "No changes were made.",
      updatedFields: updateData,
    });
  } catch (err) {
    console.error("Settings update error:", err);
    res.status(500).json({ message: "Server error" });
  }
}
