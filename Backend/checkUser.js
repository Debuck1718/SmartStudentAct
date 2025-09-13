require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const School = require('./models/School');

const MONGODB_URI = process.env.MONGODB_URI;

async function restoreOldSchools() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Database connected successfully.");

    // Step 1: Insert missing old schools if they don't exist
    const oldSchools = [
      { schoolName: 'Nabes International School', schoolCountry: 'GH', tier: 1 },
      { schoolName: 'Openlabs gh', schoolCountry: 'GH', tier: 1 }
    ];

    for (let s of oldSchools) {
      let school = await School.findOne({ schoolName: s.schoolName });
      if (!school) {
        school = new School(s);
        await school.save();
        console.log(`Inserted old school: ${s.schoolName}`);
      } else {
        console.log(`School already exists: ${s.schoolName}`);
      }
    }

    // Step 2: Re-link users to their original schools
    const users = await User.find({ schoolName: { $exists: true, $ne: null } });

    for (let user of users) {
      const school = await School.findOne({ schoolName: user.schoolName });
      if (school) {
        user.school = school._id;
        await user.save();
        console.log(`Linked user ${user.email} → ${school.schoolName}`);
      } else {
        console.log(`No school found for user ${user.email}, leaving null`);
      }
    }

    console.log("✅ Users restored to their schools successfully.");
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

restoreOldSchools();







