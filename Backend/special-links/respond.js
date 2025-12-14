// Express-compatible handler for POST /api/special-links/respond
import SpecialLinkRequest from "../models/SpecialLinkRequests.js";
import SpecialLink from "../models/SpecialLink.js";
import logger from "../utils/logger.js";

export default async function handler(req, res) {
  const userId = req.userId;

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { requestId, action } = req.body; // action = "approve" or "reject"
    if (!requestId || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "requestId and valid action (approve/reject) are required." });
    }

    const request = await SpecialLinkRequest.findById(requestId);
    if (!request || request.receiver_id.toString() !== userId.toString()) {
      return res.status(404).json({ message: "Request not found or unauthorized." });
    }

    if (request.status !== "pending") return res.status(400).json({ message: "This request has already been responded to." });

    request.status = action === "approve" ? "approved" : "rejected";
    request.responded_at = new Date();
    await request.save();

    if (action === "approve") {
      const isTeacherRequester = request.request_type === "special_teacher";
      try {
        const newLink = new SpecialLink({
          teacher_id: isTeacherRequester ? request.requester_id : request.receiver_id,
          student_id: isTeacherRequester ? request.receiver_id : request.requester_id,
          status: "active",
        });
        await newLink.save();
      } catch (e) {
        // possible duplicate unique index - ignore but log
        logger.warn("Could not create special link (might already exist):", e.message);
      }
    }

    res.status(200).json({ message: `Request ${action}ed successfully.`, request });
  } catch (err) {
    logger.error("Error responding to special link request:", err);
    res.status(500).json({ message: "Failed to process response.", error: err.message });
  }
}
