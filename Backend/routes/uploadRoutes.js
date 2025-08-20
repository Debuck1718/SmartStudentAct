// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const User = require('../models/User'); // Adjust the path to your User model
const { authenticateJWT } = require('../middlewares/auth'); // Your existing authentication middleware

// Configure Multer for in-memory storage, as Cloudinary prefers a buffer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configure Cloudinary with your credentials
// IMPORTANT: Replace with your actual Cloudinary credentials.
cloudinary.config({
  cloud_name: 'dojwivvg9',
  api_key: '711866489426895',
  api_secret: 'u96Br5zFHI0qBLNjQS-mjzRwilE'
});

// Endpoint to handle the photo upload
router.post('/profile/upload-photo', authenticateJWT, upload.single('profilePhoto'), async (req, res) => {
  try {
    // Check if a file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file was uploaded.' });
    }

    // Convert the buffer to a base64 string for upload
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    let dataURI = "data:" + req.file.mimetype + ";base64," + b64;

    // Upload the image to Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: `SmartStudentAct/${req.user.id}/profile`, // A folder structure to keep images organized
      tags: ['profile_photo'],
    });

    // Update the user's MongoDB document with the new photo URL
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { profile_photo_url: result.secure_url },
      { new: true, runValidators: true } // Return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.status(200).json({
      message: 'Profile photo uploaded successfully!',
      photoUrl: updatedUser.profile_photo_url
    });

  } catch (err) {
    console.error('Error uploading to Cloudinary:', err);
    res.status(500).json({ error: 'Failed to upload photo.' });
  }
});

module.exports = router;
