import dbConnect from "@/lib/db";
import User from "@/models/User";
import { authenticateJWT } from "@/middlewares/auth";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(process.cwd(), "public/uploads/profile");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${file.fieldname}${ext}`);
    },
  }),
});

// Helper to wrap multer in Vercel handler
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export const config = {
  api: { bodyParser: false }, // Disable body parsing for file uploads
};

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  await dbConnect();

  try {
    const user = await authenticateJWT(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    await runMiddleware(req, res, upload.single("profilePhoto"));
    const filePath = `/uploads/profile/${req.file.filename}`;

    await User.updateOne(
      { _id: user._id },
      { $set: { profile_picture_url: filePath } }
    );

    res.status(200).json({
      message: "Profile picture updated successfully.",
      photoUrl: filePath,
    });
  } catch (err) {
    console.error("Photo upload error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
