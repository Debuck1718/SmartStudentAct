// seedUsers.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // adjust path if needed

const MONGODB_URI = process.env.MONGODB_URI;
const INITIAL_GLOBAL_OVERSEER_EMAIL = process.env.INITIAL_GLOBAL_OVERSEER_EMAIL;
const INITIAL_GLOBAL_OVERSEER_PASSWORD = process.env.INITIAL_GLOBAL_OVERSEER_PASSWORD;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found. Did you set it in your .env file?");
  process.exit(1);
}

if (!INITIAL_GLOBAL_OVERSEER_EMAIL || !INITIAL_GLOBAL_OVERSEER_PASSWORD) {
  console.error("❌ Initial global overseer credentials not found in .env");
  process.exit(1);
}

async function seedUsers() {
  try {
    console.log(`Attempting to connect to MONGODB_URI: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);

    // ✅ Best Practice: Trim and convert emails to lowercase for consistency
    const globalOverseerEmail = INITIAL_GLOBAL_OVERSEER_EMAIL.toLowerCase().trim();
    const globalOverseerPassword = INITIAL_GLOBAL_OVERSEER_PASSWORD.trim();

    const users = [
      {
        name: "Admin One",
        email: "admin1@school.com".toLowerCase(),
        password: await bcrypt.hash("adminpass123", 10),
        role: "admin",
        schoolName: "Sunrise High School",
        schoolCountry: "GH",
        verified: true,
      },
      {
        name: "Overseer One",
        email: "overseer1@schools.com".toLowerCase(),
        password: await bcrypt.hash("overseerpass123", 10),
        role: "overseer",
        verified: true,
      },
      {
        name: "Global Overseer",
        email: globalOverseerEmail,
        password: await bcrypt.hash(globalOverseerPassword, 10),
        role: "global_overseer",
        verified: true,
      },
    ];

    // Automatically set is_admin = true for specific roles
    for (const u of users) {
      u.is_admin = ['admin', 'overseer', 'global_overseer'].includes(u.role);
      
      // ✅ New logic to handle subscription status based on role
      if (u.role === 'global_overseer' || u.role === 'overseer') {
        u.is_on_trial = false;
        u.subscription_status = 'active';
        u.trial_end_date = null;
      } else {
        u.is_on_trial = true;
        u.subscription_status = 'inactive';
        u.trial_end_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

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