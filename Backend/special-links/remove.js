// api/special-links/remove.js
import dbConnect from "@/lib/db";
import SpecialLink from "@/models/SpecialLink";
import { authenticateJWT } from "@/middlewares/auth";
import logger from "@/utils/logger";

export default async function handler(req, res) {
  await dbConnect();
  await authenticateJWT(req, res);

  const userId = req.userId;

  try {
    if (req.method !== "DELETE") {
      res.setHeader("Allow", ["DELETE"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { linkId } = req.query;

    if (!linkId) {
      return res.status(400).json({ message: "Missing linkId parameter." });
    }

    // Find the link
    const link = await SpecialLink.findById(linkId);

    if (!link) {
      return res.status(404).json({ message: "Special link not found." });
    }

    // Ensure the authenticated user is one of the parties
    const isAuthorized =
      link.teacher_id.toString() === userId.toString() ||
      link.student_id.toString() === userId.toString();

    if (!isAuthorized) {
      return res.status(403).json({
        message: "You are not authorized to remove this link.",
      });
    }

    // Delete or mark inactive
    await SpecialLink.findByIdAndUpdate(linkId, { status: "inactive" });

    logger.info(
      `User ${userId} removed special link ${linkId} (${link.teacher_id} ↔ ${link.student_id})`
    );

    return res.status(200).json({
      message: "Special link removed successfully.",
      linkId,
    });
  } catch (err) {
    logger.error("Error removing special link:", err);
    return res.status(500).json({
      message: "Failed to remove special link.",
      error: err.message,
    });
  }
}
