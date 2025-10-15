import dbConnect from "@/lib/db";
import Worker from "@/models/worker";
import User from "@/models/User";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    await dbConnect();
    const { user_id, country, occupation } = req.body;

    if (!user_id || !country) {
      return res.status(400).json({ success: false, message: "user_id and country are required" });
    }

    // Ensure user exists
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if worker profile already exists
    const existingWorker = await Worker.findOne({ user_id });
    if (existingWorker) {
      return res.status(400).json({ success: false, message: "Worker profile already exists" });
    }

    // Create worker progress record
    const worker = await Worker.create({
      user_id,
      country,
      occupation: occupation || "worker",
    });

    res.status(201).json({ success: true, message: "Worker profile created", data: worker });
  } catch (error) {
    console.error("Worker creation error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}
