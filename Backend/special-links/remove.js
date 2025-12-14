// Express-compatible handler for DELETE /api/special-links/remove
import SpecialLink from "../models/SpecialLink.js";
import logger from "../utils/logger.js";

export default async function handler(req, res) {
  const userId = req.userId;

  try {
    if (req.method !== "DELETE") {
      res.setHeader("Allow", ["DELETE"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { linkId } = req.query;
    if (!linkId) return res.status(400).json({ message: "Missing linkId parameter." });

    const link = await SpecialLink.findById(linkId);
    if (!link) return res.status(404).json({ message: "Special link not found." });

    const isAuthorized = link.teacher_id.toString() === userId.toString() || link.student_id.toString() === userId.toString();
    if (!isAuthorized) return res.status(403).json({ message: "You are not authorized to remove this link." });

    await SpecialLink.findByIdAndUpdate(linkId, { status: "revoked" });

    logger.info(`User ${userId} removed special link ${linkId} (${link.teacher_id} ↔ ${link.student_id})`);

    return res.status(200).json({ message: "Special link removed successfully.", linkId });
  } catch (err) {
    logger.error("Error removing special link:", err);
    return res.status(500).json({ message: "Failed to remove special link.", error: err.message });
  }
}
