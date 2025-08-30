// fixPassword.js
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb+srv://...";

async function run() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    const user = await User.findOne({ email: "vmensa564@gmail.com" }).select("+password");
    if (!user) {
      console.log("❌ User not found");
      return process.exit(1);
    }

    // Set plain password, let pre-save hook hash it
    user.password = "Victoria123%";
    await user.save();

    console.log("✅ Password fixed for", user.email);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

run();

