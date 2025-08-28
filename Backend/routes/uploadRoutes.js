const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const User = require('../models/User'); 
const { authenticateJWT } = require('../middlewares/auth'); 

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

cloudinary.config({
  cloud_name: 'dojwivvg9',
  api_key: '711866489426895',
  api_secret: 'u96Br5zFHI0qBLNjQS-mjzRwilE'
});

router.post('/profile/upload-photo', authenticateJWT, upload.single('profilePhoto'), async (req, res) => {
  try {
  
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file was uploaded.' });
    }

    const b64 = Buffer.from(req.file.buffer).toString("base64");
    let dataURI = "data:" + req.file.mimetype + ";base64," + b64;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: `SmartStudentAct/${req.user.id}/profile`, 
      tags: ['profile_photo'],
    });

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { profile_photo_url: result.secure_url },
      { new: true, runValidators: true } 
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
