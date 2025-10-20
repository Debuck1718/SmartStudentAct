import mongoose from "mongoose";

const rewardSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "Goal Crusher",
        "Budget Boss",
        "Assignment Ace",
        "Top Scholar",
        "Consistency Champ",
        "Custom",
      ],
    },
    points: { type: Number, default: 0 },
    description: { type: String, default: "" },
    granted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    granted_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

rewardSchema.index({ user_id: 1, granted_at: -1 });

const Reward = mongoose.model("Reward", rewardSchema);

export default Reward;
