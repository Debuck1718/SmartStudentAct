import dbConnect from "@/lib/db";
import Worker from "@/models/worker";
import eventBus, { agenda } from "../utils/eventBus.js";
import User from "../models/User.js";

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
    try {
      // Emit worker reminder created event
      eventBus.emit("worker_reminder_created", { workerId: worker.user_id, reminder: { title, due_date, category, is_recurring } });
      // schedule agenda job to run at due_date to send reminder
      const runDate = new Date(due_date);
      try {
        if (agenda && typeof agenda.schedule === 'function') {
          await agenda.schedule(runDate, 'worker_reminder', { workerId: worker.user_id, title, due_date });
        }
      } catch (e) {
        console.error('Failed to schedule worker reminder:', e.message);
      }
    } catch (err) {
      console.error("Event emit failed:", err.message);
    }
  } catch (error) {
    console.error("Add reminder error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}
