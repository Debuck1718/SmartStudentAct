require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

async function checkPassword() {
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email: "afedziesylvanus@gmail.com"}).select('+password');

  if (!user) return console.log('❌ User not found');

  const match = await bcrypt.compare( "Afedzie123%", user.password);
  console.log('Password match?', match);

  process.exit(0);
}

checkPassword();
