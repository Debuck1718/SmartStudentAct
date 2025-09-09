const Agenda = require("agenda");
const Quiz = require("../models/Quiz");
const StudentTask = require("../models/StudentTask"); 
const logger = require("../utils/logger");

module.exports = (mongoConnectionString) => {
  if (!mongoConnectionString) {
    throw new Error("❌ MONGODB_URI missing for Agenda");
  }

  const agenda = new Agenda({
    db: { address: mongoConnectionString, collection: "agendaJobs" },
    processEvery: "30 seconds",
  });

  // --- DEFINE JOBS ---
  agenda.on("ready", async () => {
    console.log("✅ Agenda is ready");

    /**
     * Auto-submit overdue quizzes
     */
    agenda.define("auto-submit overdue quizzes", async () => {
      const now = new Date();
      try {
        const quizzes = await Quiz.find({ timeLimitMinutes: { $ne: null } });

        for (const quiz of quizzes) {
          for (const submission of quiz.submissions) {
            if (submission.submitted_at) continue;

            const timeElapsed =
              (now.getTime() - submission.started_at.getTime()) / 60000; // in minutes
            if (timeElapsed >= quiz.timeLimitMinutes) {
              submission.submitted_at = now;
              submission.auto_submitted = true;

              let score = 0;
              quiz.questions.forEach((q, index) => {
                if (submission.answers[index] === q.correct) score++;
              });
              submission.score = score;

              logger.info(
                `Auto-submitted quiz "${quiz.title}" for student ${submission.student_id}`
              );
            }
          }

          await quiz.save();
        }
      } catch (err) {
        logger.error("Error auto-submitting overdue quizzes:", err);
      }
    });

    /**
     * Task Reminder job
     */
    agenda.define("task_reminder", async (job) => {
      try {
        const { taskId, studentId, message } = job.attrs.data;
        logger.info(`📢 Reminder for student ${studentId}, task ${taskId}: ${message}`);

        // TODO: Integrate notification service (email, push, in-app, etc.)
        // Example: eventBus.emit("task_reminder", { studentId, taskId, message });

      } catch (err) {
        logger.error("Error running task_reminder job:", err);
      }
    });

    // --- SCHEDULE RECURRING JOBS ---
    await agenda.every("1 minute", "auto-submit overdue quizzes");

    /**
     * Reschedule task reminders on restart
     */
    const tasks = await StudentTask.find({ due_date: { $gte: new Date() } });

    for (const task of tasks) {
      const dueDate = new Date(task.due_date);

      const sixHoursBefore = new Date(dueDate.getTime() - 6 * 60 * 60 * 1000);
      const twoHoursBefore = new Date(dueDate.getTime() - 2 * 60 * 60 * 1000);

      if (sixHoursBefore > new Date()) {
        await agenda.schedule(sixHoursBefore, "task_reminder", {
          taskId: task._id,
          studentId: task.student_id,
          message: `Reminder: Your task "${task.title}" is due in 6 hours.`,
        });
      }

      if (twoHoursBefore > new Date()) {
        await agenda.schedule(twoHoursBefore, "task_reminder", {
          taskId: task._id,
          studentId: task.student_id,
          message: `Reminder: Your task "${task.title}" is due in 2 hours.`,
        });
      }
    }

    await agenda.start();
  });

  agenda.on("error", (err) => {
    console.error("❌ Agenda error:", err);
  });

  return agenda;
};
