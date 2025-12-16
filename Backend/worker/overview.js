import dbConnect from "../lib/db.js";
import Worker from "../models/worker.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    await dbConnect();
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ success: false, message: "Missing user_id in query" });
    }

    const worker = await Worker.findOne({ user_id });
    if (!worker) {
      return res.status(404).json({ success: false, message: "Worker not found" });
    }

    // --- Summarized metrics ---
    const totalGoals = worker.goals.length;
    const completedGoals = worker.goals.filter(g => g.is_completed).length;

    const totalTransactions = worker.finance.transactions.length;
    const totalIncome = worker.finance.transactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = worker.finance.transactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSavings = worker.finance.transactions
      .filter(t => t.type === "saving")
      .reduce((sum, t) => sum + t.amount, 0);

    const activeReminders = worker.reminders.filter(r => !r.is_dismissed).length;

    // --- Daily streaks and engagement summary ---
    const streakStatus =
      worker.active_streak_days >= 7
        ? "consistent"
        : worker.active_streak_days > 0
        ? "active"
        : "inactive";

    // --- Subscription status ---
    const subscriptionStatus =
      worker.plan_type === "premium"
        ? "Premium Active"
        : worker.plan_type === "trial" && worker.trial_end_at > new Date()
        ? "Trial Active"
        : "Free";

    const daysLeftInTrial =
      worker.plan_type === "trial" && worker.trial_end_at
        ? Math.max(0, Math.ceil((worker.trial_end_at - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;

    // --- Final Overview ---
    const overview = {
      user_id: worker.user_id,
      country: worker.country,
      occupation: worker.occupation,
      motivation_level: worker.motivation_level,
      productivity: worker.productivity,
      total_goals: totalGoals,
      completed_goals: completedGoals,
      goal_progress_percent: totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0,
      financial_summary: {
        total_transactions: totalTransactions,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        total_savings: totalSavings,
        current_budget_name: worker.finance.current_budget_name,
        total_savings_balance: worker.finance.total_savings_balance,
        total_expenses_current_period: worker.finance.total_expenses_current_period,
      },
      reminders_summary: {
        total_reminders: worker.reminders.length,
        active_reminders: activeReminders,
      },
      engagement: {
        active_streak_days: worker.active_streak_days,
        streak_status: streakStatus,
        last_login: worker.last_login,
      },
      subscription: {
        plan_type: worker.plan_type,
        status: subscriptionStatus,
        days_left_in_trial: daysLeftInTrial,
      },
      updated_at: worker.updatedAt,
    };

    res.status(200).json({ success: true, data: overview });
  } catch (error) {
    console.error("Worker overview error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}
