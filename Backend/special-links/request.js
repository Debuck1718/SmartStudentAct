// Express-compatible handler for POST/GET /api/special-links/request
import SpecialLinkRequest from "../models/SpecialLinkRequests.js";
import logger from "../utils/logger.js";

export default async function handler(req, res) {
  const userId = req.userId;

  try {
    // === CREATE REQUEST ===
    if (req.method === "POST") {
      const { receiverId, requestType, message } = req.body;

      if (!receiverId || !requestType) {
        return res.status(400).json({ message: "receiverId and requestType are required." });
      }

      const existing = await SpecialLinkRequest.findOne({ requester_id: userId, receiver_id: receiverId, status: "pending" });
      if (existing) return res.status(400).json({ message: "You already have a pending request to this user." });

      const newRequest = new SpecialLinkRequest({ requester_id: userId, receiver_id: receiverId, request_type: requestType, message: message || "" });
      await newRequest.save();

      return res.status(201).json({ message: "Special link request sent successfully.", request: newRequest });
    }

    // === GET REQUESTS ===
    if (req.method === "GET") {
      const { type } = req.query; // "sent" or "received"

      let filter = {};
      if (type === "sent") filter.requester_id = userId;
      else if (type === "received") filter.receiver_id = userId;
      else return res.status(400).json({ message: "Invalid type. Use ?type=sent or ?type=received" });

      const requests = await SpecialLinkRequest.find(filter)
        .populate("requester_id", "firstname lastname email role")
        .populate("receiver_id", "firstname lastname email role")
        .sort({ createdAt: -1 });

      return res.status(200).json({ requests });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    logger.error("Error in special link request route:", err);
    res.status(500).json({ message: "Server error while handling special link request.", error: err.message });
  }
}
