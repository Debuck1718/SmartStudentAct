import dbConnect from "@/lib/db";
import Worker from "@/models/worker";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    await dbConnect();
    const { user_id, type, amount, description, category } = req.body;

    if (!user_id || !type || !amount) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const worker = await Worker.findOne({ user_id });
    if (!worker) {
      return res.status(404).json({ success: false, message: "Worker not found" });
    }

    worker.finance.transactions.push({
      type,
      amount,
      description,
      category,
    });

    // Recalculate summaries
    if (type === "saving") {
      worker.finance.total_savings_balance += amount;
    } else if (type === "expense") {
      worker.finance.total_expenses_current_period += amount;
    }

    await worker.save();
    res.status(200).json({ success: true, message: "Transaction added successfully", data: worker.finance });
  } catch (error) {
    console.error("Add transaction error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
}
