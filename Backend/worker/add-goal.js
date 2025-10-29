import dbConnect from "@/lib/db";
import Worker from "@/models/worker";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    await dbConnect();
    const { user_id, title, description, target_completion_date, category } = req.body;

    if (!user_id || !title || !target_completion_date) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const worker = await Worker.findOne({ user_id });
    if (!worker) {
      return res.status(404).json({ success: false, message: "Worker not found" });
    }

    worker.goals.push({
      title,
      description,
      target_completion_date,
      category,
    });

    await worker.save();
    res.status(200).json({ success: true, message: "Goal added successfully", data: worker.goals });
  } catch (error) {
    console.error("Add goal error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}
