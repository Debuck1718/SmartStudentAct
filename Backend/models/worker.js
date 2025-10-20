import mongoose from "mongoose";

const goalSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500 },
  target_completion_date: { type: Date, required: true },
  category: {
    type: String,
    enum: ["career", "personal", "financial", "education", "wellness"],
    default: "career",
  },
  is_completed: { type: Boolean, default: false },
  completed_at: { type: Date, default: null },
  progress_percentage: { type: Number, min: 0, max: 100, default: 0 },
});

const transactionSchema = new mongoose.Schema({
  type: { type: String, enum: ["income", "expense", "saving"], required: true },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true, maxlength: 200 },
  category: { type: String, trim: true },
  date: { type: Date, default: Date.now },
});

const reminderSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  due_date: { type: Date, required: true },
  is_recurring: { type: Boolean, default: false },
  is_dismissed: { type: Boolean, default: false },
  category: {
    type: String,
    enum: ["personal", "work", "finance", "learning"],
    default: "personal",
  },
});

const workerSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    country: { type: String, required: true, trim: true, uppercase: true },
    occupation: { type: String, trim: true, default: "worker", maxlength: 100 },
    productivity: {
      total_tasks_completed: { type: Number, default: 0 },
      last_task_completion: { type: Date, default: null },
      average_daily_score: { type: Number, default: 0 },
    },
    goals: [goalSchema],
    finance: {
      current_budget_name: { type: String, default: "Monthly" },
      budget_limit: { type: Number, default: 0, min: 0 },
      transactions: [transactionSchema],
      total_savings_balance: { type: Number, default: 0, min: 0 },
      total_expenses_current_period: { type: Number, default: 0, min: 0 },
    },
    reminders: [reminderSchema],
    motivation_level: { type: Number, min: 0, max: 100, default: 50 },
    reflection_notes: [
      {
        note: { type: String, trim: true, maxlength: 1000 },
        created_at: { type: Date, default: Date.now },
      },
    ],
    last_login: { type: Date, default: Date.now },
    active_streak_days: { type: Number, default: 0, min: 0 },
    plan_type: {
      type: String,
      enum: ["free", "trial", "premium"],
      default: "trial",
    },
    trial_end_at: {
      type: Date,
      default: function () {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
      },
    },
    subscription_status: {
      type: String,
      enum: ["inactive", "active", "expired"],
      default: "inactive",
    },
    payment_gateway: { type: String, default: null },
    payment_date: { type: Date, default: null },
  },
  { timestamps: true, collection: "workers" }
);

workerSchema.index({ user_id: 1 });

const Worker = mongoose.model("Worker", workerSchema);

export default Worker;
