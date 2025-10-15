import dbConnect from "@/lib/db";
import agenda from "@/utils/agenda";
import logger from "@/utils/logger";

export default async function handler(req, res) {
  await dbConnect();
  try {
    await agenda.now("auto-submit overdue quizzes");
    await agenda.now("task_reminder");
    await agenda.now("worker_reminder");
    res.status(200).json({ success: true, message: "Jobs executed" });
  } catch (err) {
    logger.error("Cron execution error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
