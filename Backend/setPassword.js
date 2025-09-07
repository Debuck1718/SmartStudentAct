require('dotenv').config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");

const BCRYPT_SALT_ROUNDS = 10;

async function setPassword(email, newPassword) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      console.log(`User with email ${email} not found`);
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    user.password = hashedPassword;
    await user.save();

    console.log(`✅ Password updated for ${email}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

setPassword("afedziesylvanus@gmail.com", "Afedzie123%");

