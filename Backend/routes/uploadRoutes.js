import express from "express";
import cloudinaryPackage from "cloudinary";
import multer from "multer";
import User from "../models/User.js";
import { authenticateJWT } from "../middlewares/auth.js";

const router = express.Router();
const cloudinary = cloudinaryPackage.v2;

const storage = multer.memoryStorage();
const upload = multer({ storage });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.post(
  "/profile/upload-photo",
  authenticateJWT,
  upload.single("profilePhoto"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo file was uploaded." });
      }

      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;

      const result = await cloudinary.uploader.upload(dataURI, {
        folder: `SmartStudentAct/${req.user.id}/profile`,
        tags: ["profile_photo"],
      });

      // store using unified field `profile_picture_url` for consistency
      const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        { profile_picture_url: result.secure_url },
        { new: true, runValidators: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found." });
      }

      res.status(200).json({
        message: "Profile photo uploaded successfully!",
        photoUrl: updatedUser.profile_picture_url,
      });
    } catch (err) {
      console.error("Error uploading to Cloudinary:", err);
      res.status(500).json({ error: "Failed to upload photo." });
    }
  }
);

export default router;

