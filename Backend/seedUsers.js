// seedUsers.js – Seeds Admins, Overseers, and Global Overseer
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const User = require("./models/User");

// --- Log MONGO_URI ---
console.log("Attempting to connect to MONGO_URI:", process.env.MONGODB_URI);

const specialUsersPath = path.join(__dirname, "specialUsers.json");

// Default template for local JSON seeding
const defaultSpecialUsers = [
  {
    name: "Admin One",
    email: "admin1@school.com",
    password: "adminpass123",
    role: "admin",
    schoolName: "Sunrise High School",
    schoolCountry: "GH", // ✅ required now
  },
  {
    name: "Overseer One",
    email: "overseer1@schools.com",
    password: "overseerpass123",
    role: "overseer",
  },
];

// Ensure specialUsers.json exists
if (!fs.existsSync(specialUsersPath)) {
  fs.writeFileSync(
    specialUsersPath,
    JSON.stringify(defaultSpecialUsers, null, 2)
  );
  console.log(`📄 Created ${specialUsersPath} with default seed data`);
}

// Load from JSON
const specialUsers = require(specialUsersPath);

// Add Global Overseer from ENV
if (
  process.env.INITIAL_GLOBAL_OVERSEER_EMAIL &&
  process.env.INITIAL_GLOBAL_OVERSEER_PASSWORD
) {
  // Check if already exists in JSON
  const alreadyExists = specialUsers.find(
    (u) => u.email === process.env.INITIAL_GLOBAL_OVERSEER_EMAIL
  );

  if (!alreadyExists) {
    specialUsers.push({
      name: process.env.INITIAL_GLOBAL_OVERSEER_NAME || "Global Overseer",
      email: process.env.INITIAL_GLOBAL_OVERSEER_EMAIL,
      password: process.env.INITIAL_GLOBAL_OVERSEER_PASSWORD,
      role: "global_overseer",
    });
  }
} else {
  console.warn(
    "⚠️ No INITIAL_GLOBAL_OVERSEER_* set in .env — skipping global overseer creation"
  );
}

async function seedUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    for (const userData of specialUsers) {
      // ✅ Fallback defaults for admins
      if (userData.role === "admin") {
        if (!userData.schoolName) userData.schoolName = "Default School";
        if (!userData.schoolCountry) userData.schoolCountry = "Default Country";
      }

      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        let updated = false;

        if (existingUser.role !== userData.role) {
          existingUser.role = userData.role;
          updated = true;
        }

        if (userData.role === "admin") {
          if (existingUser.schoolName !== userData.schoolName) {
            existingUser.schoolName = userData.schoolName;
            updated = true;
          }
          if (existingUser.schoolCountry !== userData.schoolCountry) {
            existingUser.schoolCountry = userData.schoolCountry;
            updated = true;
          }
        }

        if (!existingUser.isVerified) {
          existingUser.isVerified = true;
          updated = true;
        }

        // ✅ Password update: only compare if both exist
        if (userData.password) {
          if (!existingUser.password) {
            // Missing password → set new one
            existingUser.password = await bcrypt.hash(userData.password, 10);
            updated = true;
          } else {
            const passwordMatches = await bcrypt.compare(
              userData.password,
              existingUser.password
            );
            if (!passwordMatches) {
              existingUser.password = await bcrypt.hash(userData.password, 10);
              updated = true;
            }
          }
        }

        if (updated) {
          await existingUser.save();
          console.log(`✅ Updated ${userData.role}: ${userData.email}`);
        } else {
          console.log(`ℹ️ No changes for ${userData.email}`);
        }
      } else {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const newUser = {
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          isVerified: true,
        };

        if (userData.role === "admin") {
          newUser.schoolName = userData.schoolName;
          newUser.schoolCountry = userData.schoolCountry;
        }

        await User.create(newUser);
        console.log(`✅ Created ${userData.role}: ${userData.email}`);
      }
    }

    console.log("🎉 Seeding complete");
  } catch (error) {
    console.error("❌ Error seeding users:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

seedUsers();

