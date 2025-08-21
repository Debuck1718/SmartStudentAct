// seedUsers.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // adjust path if needed

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found. Did you set it in your .env file?");
  process.exit(1);
}

async function seedUsers() {
  try {
    console.log(`Attempting to connect to MONGODB_URI: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);

    const users = [
      {
        name: "Admin One",
        email: "admin1@school.com",
        password: await bcrypt.hash("adminpass123", 10),
        role: "admin",
        schoolName: "Sunrise High School",
        schoolCountry: "GH",
        verified: true,
      },
      {
        name: "Overseer One",
        email: "overseer1@schools.com",
        password: await bcrypt.hash("overseerpass123", 10),
        role: "overseer",
        verified: true,
      },
      {
        name: "Global Overseer",
        email: "evans.buckman55@gmail.com",
        password: await bcrypt.hash("globalpass123", 10),
        role: "global_overseer",
        verified: true,
      }
    ];

    for (const u of users) {
      const existing = await User.findOne({ email: u.email });
      if (existing) {
        await User.updateOne({ email: u.email }, { $set: u });
        console.log(`✅ Updated ${u.role}: ${u.email}`);
      } else {
        await User.create(u);
        console.log(`✅ Created ${u.role}: ${u.email}`);
      }
    }

    console.log("🎉 Seeding complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding error:", err);
    process.exit(1);
  }
}

seedUsers();

