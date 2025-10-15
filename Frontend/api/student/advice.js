import dbConnect from "@/lib/db";
import User from "@/models/User";
import StudentRewards from "@/models/StudentRewards";
import BudgetEntry from "@/models/BudgetEntry";
import { authenticateJWT } from "@/middlewares/auth";
import { generateGeminiAdviceWithRetry } from "@/api/student/utils/generateGeminiAdvice";
import logger from "@/utils/logger";

export default authenticateJWT(async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await dbConnect();
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.is_on_trial && user.trialInsightsUsed >= user.trialInsightsLimit) {
      return res.status(403).json({
        message: `Trial limit reached. You can only generate ${user.trialInsightsLimit} AI insights. Please subscribe to continue.`,
      });
    }

    const studentData = await StudentRewards.findOne({ studentId: userId });
    const budgetData = await BudgetEntry.find({ userId });

    let advice;
    if (!studentData) {
      advice = {
        studyAdvice: "Start setting goals to get personalized advice!",
        spendingAdvice: "Log your first budget entry to get financial tips!",
      };
    } else {
      const studentInfo = `
        Student Name: ${studentData.name}
        Term Percentage: ${studentData.termPercentage}%
        Consistent Months: ${studentData.consistentMonths}
        Weekly Goals Achieved: ${studentData.weeklyGoalsAchieved}
        Current Goals: ${studentData.goals.map((g) => g.description).join(", ")}
      `;

      const spendingByCategory = {};
      budgetData
        .filter((e) => e.type === "expense")
        .forEach((entry) => {
          spendingByCategory[entry.category] =
            (spendingByCategory[entry.category] || 0) + entry.amount;
        });

      const budgetInfo = `
        Budgeting Data (past month):
        Total Expenses: $${budgetData.reduce(
          (sum, entry) =>
            entry.type === "expense" ? sum + entry.amount : sum,
          0
        )}
        Spending by Category: ${JSON.stringify(spendingByCategory, null, 2)}
      `;

      const prompt = `
        Based on the following user data, provide concise and actionable advice on their goals and spending habits.
        Student Data:
        ${studentInfo}

        Budget Data:
        ${budgetInfo}

        Please provide a short, encouraging message for their study goals and a clear, helpful tip for their financial habits.
        Format as JSON: {"studyAdvice": "...", "spendingAdvice": "..."}
      `;

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              studyAdvice: { type: "STRING" },
              spendingAdvice: { type: "STRING" },
            },
          },
        },
      };

      advice = await generateGeminiAdviceWithRetry(payload, 3);
    }

    if (user.is_on_trial) {
      user.trialInsightsUsed = (user.trialInsightsUsed || 0) + 1;
      await user.save();
    }

    res.status(200).json({ advice });
  } catch (error) {
    logger.error("Error fetching personalized advice:", error);
    res.status(500).json({ message: "Failed to fetch advice." });
  }
});
