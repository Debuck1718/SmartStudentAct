import dbConnect from "@/lib/db";
import Worker from "@/models/worker";
import eventBus from "../utils/eventBus.js";
import User from "../models/User.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    await dbConnect();
    const { user_id, updates } = req.body;

    if (!user_id || typeof updates !== "object") {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid fields. Expected { user_id, updates }",
      });
    }

    const worker = await Worker.findOne({ user_id });
    if (!worker) {
      return res.status(404).json({ success: false, message: "Worker not found" });
    }

    // --- Handle Motivation Updates ---
    if (typeof updates.motivation_delta === "number") {
      worker.motivation_level = Math.min(
        100,
        Math.max(0, worker.motivation_level + updates.motivation_delta)
      );
    }

    // --- Handle Task/Goal Completion Updates ---
    if (updates.completed_goal) {
      const goal = worker.goals.id(updates.completed_goal);
      if (goal && !goal.is_completed) {
        goal.is_completed = true;
        goal.completed_at = new Date();
        goal.progress_percentage = 100;
        worker.productivity.total_tasks_completed += 1;
      }
    }

    // --- Handle Productivity Updates ---
    if (typeof updates.daily_score === "number") {
      // Update average daily score (simple moving average)
      const prev = worker.productivity.average_daily_score;
      worker.productivity.average_daily_score =
        prev > 0 ? Math.round((prev + updates.daily_score) / 2) : updates.daily_score;

      worker.productivity.last_task_completion = new Date();
      worker.productivity.total_tasks_completed += 1;
    }

    // --- Handle Streak Updates ---
    if (updates.increment_streak) {
      const today = new Date();
      const lastLogin = new Date(worker.last_login);
      const daysDiff = Math.floor((today - lastLogin) / (1000 * 60 * 60 * 24));

      // Increment streak only if the user is active today or consecutive days
      if (daysDiff <= 1) {
        worker.active_streak_days += 1;
      } else {
        // Reset streak if inactivity
        worker.active_streak_days = 1;
      }

      worker.last_login = today;
    }

    // --- Handle Reflection Notes ---
    if (updates.new_reflection) {
      worker.reflection_notes.push({
        note: updates.new_reflection,
        created_at: new Date(),
      });
    }

    // --- Save Worker Data ---
    await worker.save();

    // Emit worker progress update
    try {
      eventBus.emit("worker_progress_updated", { workerId: worker.user_id, updates });
    } catch (err) {
      console.error("Event emit failed:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: "Worker progress updated successfully",
      updated_worker: {
        motivation_level: worker.motivation_level,
        productivity: worker.productivity,
        active_streak_days: worker.active_streak_days,
        last_login: worker.last_login,
      },
    });
  } catch (error) {
    console.error("Worker progress update error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}
