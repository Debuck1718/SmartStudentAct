import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    teacherName: String,
    studentId: mongoose.Schema.Types.ObjectId,
    text: String,
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);
export default Message;
