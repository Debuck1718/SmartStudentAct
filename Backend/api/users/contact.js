// /api/public/contact.js
import { connectDb } from "@/utils/connectDb";
import Contact from "@/models/Contact";
import { sendContactEmail } from "@/utils/email";
import logger from "@/utils/logger";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDb();
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const newContact = new Contact({ name, email, subject, message });
    await newContact.save();

    await sendContactEmail(name, email, subject, message);

    res.status(201).json({ message: "Message sent successfully!" });
  } catch (err) {
    logger.error("❌ Contact form error:", err);
    res.status(500).json({ message: "Failed to send contact message" });
  }
}
