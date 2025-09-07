require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User'); // adjust path if needed

const MONGODB_URI = "mongodb+srv://Smartstudentadmin:IAjFedj31EADYiZQ@cluster0.qtnlydx.mongodb.net/smartstudentact?retryWrites=true&w=majority";

async function checkUser() {
  await mongoose.connect(MONGODB_URI);
  const user = await User.findOne({ email: "afedziesylvanus@gmail.com" }).lean();
  console.log(user ? "✅ User exists:" : "❌ User not found");
  console.log(user);
  process.exit(0);
}

checkUser().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
