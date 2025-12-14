// Express-compatible handler for GET /api/special-links/list
import SpecialLink from "../models/SpecialLink.js";
import logger from "../utils/logger.js";

export default async function handler(req, res) {
  const userId = req.userId;

  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const links = await SpecialLink.find({
      $or: [{ teacher_id: userId }, { student_id: userId }],
      status: "active",
    })
      .populate("teacher_id", "firstname lastname email role school")
      .populate("student_id", "firstname lastname email role school")
      .sort({ createdAt: -1 });

    if (!links.length) {
      return res.status(200).json({ message: "No active special connections found.", links: [] });
    }

    const formatted = links.map((link) => {
      const isTeacher = link.teacher_id._id.toString() === userId.toString();
      const partner = isTeacher ? link.student_id : link.teacher_id;

      return {
        linkId: link._id,
        partnerRole: partner.role,
        partnerId: partner._id,
        partnerName: `${partner.firstname} ${partner.lastname}`,
        partnerEmail: partner.email,
        partnerSchool: partner.school || null,
        createdAt: link.createdAt,
        status: link.status,
      };
    });

    res.status(200).json({ message: "Active special links retrieved successfully.", count: formatted.length, links: formatted });
  } catch (err) {
    logger.error("Error fetching special links list:", err);
    res.status(500).json({ message: "Failed to fetch special links.", error: err.message });
  }
}
