import { connectDb } from "../../../utils/connectDb";
import { authenticateJWT } from "../../middlewares/auth";
import School from "../../models/School";

export default async function handler(req, res) {
  await connectDb();
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const user = await authenticateJWT(req);
  if (!user || !["overseer", "global_overseer"].includes(user.role)) return res.status(403).json({ message: "Forbidden" });

  const { name, country, tier } = req.body;
  if (!name || !country || !tier) return res.status(400).json({ message: "All fields are required" });

  try {
    const newSchool = new School({ name, country, tier });
    await newSchool.save();
    res.status(201).json(newSchool);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A school with this name already exists." });
    console.error(err);
    res.status(500).json({ message: "Internal server error." });
  }
}
