import dbConnect from "@/lib/db";
import User from "@/models/User";
import { authenticateJWT } from "@/middlewares/auth";
import { timezoneSchema } from "@/validation/schemas";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await dbConnect();
    const user = await authenticateJWT(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { timezone } = req.body;
    const { error } = timezoneSchema.validate({ timezone });
    if (error) return res.status(400).json({ error: error.details[0].message });

    const result = await User.updateOne({ _id: user._id }, { timezone });
    if (result.modifiedCount > 0) {
      res.json({ ok: true, message: "Timezone updated." });
    } else {
      res.status(404).json({ error: "User not found or no change." });
    }
  } catch (err) {
    console.error("Timezone update error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
