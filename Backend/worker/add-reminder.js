import dbConnect from "@/lib/db";
import Worker from "@/models/worker";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    await dbConnect();
    const { user_id, title, due_date, category, is_recurring } = req.body;

    if (!user_id || !title || !due_date) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const worker = await Worker.findOne({ user_id });
    if (!worker) {
      return res.status(404).json({ success: false, message: "Worker not found" });
    }

    worker.reminders.push({
      title,
      due_date,
      category,
      is_recurring,
    });

    await worker.save();
    res.status(200).json({ success: true, message: "Reminder added successfully", data: worker.reminders });
  } catch (error) {
    console.error("Add reminder error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}
