import mongoose from "mongoose";

const pushSubSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subscription: {
      endpoint: String,
      keys: {
        p256dh: String,
        auth: String,
      },
    },
  },
  { timestamps: true }
);

const PushSub = mongoose.model("PushSub", pushSubSchema);
export default PushSub;
