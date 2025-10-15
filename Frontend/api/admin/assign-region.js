import { connectDb } from "../../utils/connectDb";
import { authenticateJWT } from "../../middlewares/auth";
import User from "../../models/User";

export default async function handler(req, res) {
  await connectDb();
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const user = await authenticateJWT(req);
  if (!user || user.role !== "global_overseer") return res.status(403).json({ message: "Forbidden" });

  const { overseerEmail, region } = req.body;
  if (!overseerEmail || !region) return res.status(400).json({ message: "Email and region required" });

  try {
    const targetUser = await User.findOne({ email: overseerEmail });
    if (!targetUser) return res.status(404).json({ message: "Overseer user not found" });
    if (!["overseer", "global_overseer"].includes(targetUser.role)) return res.status(400).json({ message: "Target user is not an overseer." });

    await User.updateOne({ email: overseerEmail }, { $addToSet: { managedRegions: region } });
    res.json({ message: `Region ${region} assigned to ${overseerEmail}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to assign region." });
  }
}
