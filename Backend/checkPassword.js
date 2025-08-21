require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

async function checkPassword() {
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email: process.env.INITIAL_GLOBAL_OVERSEER_EMAIL }).select('+password');

  if (!user) return console.log('❌ User not found');

  const match = await bcrypt.compare(process.env.INITIAL_GLOBAL_OVERSEER_PASSWORD, user.password);
  console.log('Password match?', match);

  process.exit(0);
}

checkPassword();
