import { connectDB } from "../../../lib/db.js";
import models from "../../../models/index.js";
import { authenticateJWT } from "../../../middlewares/auth.js";
import { hasRole } from "../../../middlewares/roles.js";
import logger from "../../../utils/logger.js";

export default async function handler(req, res) {
  await connectDB();

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const authResult = await authenticateJWT(req, res);
    if (!authResult?.user) return;
    const roleCheck = hasRole("student")(req, res);
    if (!roleCheck) return;

    const { Message } = models;
    const studentId = req.user.id;

    const messages = await Message.find({
      recipientId: studentId,
    })
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ messages });
  } catch (error) {
    logger.error("Error fetching student messages:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
}
