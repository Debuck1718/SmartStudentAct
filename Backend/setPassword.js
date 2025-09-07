require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

async function setPassword(email, newPassword) {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to DB");

  const user = await User.findOne({ email }).select('+password');
  if (!user) return console.log('❌ User not found');

  // Hash the password once
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  console.log("Hashed password:", hashedPassword);

  // Set hashed password safely without double-hashing
  user.setRawHashedPassword(hashedPassword);
  await user.save();

  console.log(`✅ Password updated for ${email}`);

  
  const match = await user.comparePassword(newPassword);
  console.log('Password match after saving?', match);

  process.exit(0);
}

setPassword("afedziesylvanus@gmail.com", "Afedzie123%");



