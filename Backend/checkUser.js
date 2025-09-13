require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const School = require('./models/School');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Smartstudentadmin:IAjFedj31EADYiZQ@cluster0.qtnlydx.mongodb.net/smartstudentact?retryWrites=true&w=majority";

async function fixSchoolsAndUsers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Database connected successfully.");

    // Step 1: Update schools with the correct schoolName
    const schoolUpdates = [
      { _id: '68c0aa46f7292157143db603', schoolName: 'Nabes International School' },
      { _id: '68c1d10fbcf3275501b57132', schoolName: 'Openlabs gh' }
    ];

    for (let s of schoolUpdates) {
      const school = await School.findById(s._id);
      if (school) {
        school.schoolName = s.schoolName;
        await school.save();
        console.log(`Updated school ${s._id} with schoolName: ${s.schoolName}`);
      } else {
        console.log(`School ${s._id} not found.`);
      }
    }

    // Step 2: Update users with schoolName from linked school
    const users = await User.find({ school: { $exists: true, $ne: null } });
    for (let user of users) {
      const school = await School.findById(user.school);
      if (school) {
        user.schoolName = school.schoolName;
        await user.save();
        console.log(`Updated user ${user.email} with schoolName: ${school.schoolName}`);
      } else {
        console.log(`User ${user.email} has linked school ID ${user.school} which was not found`);
      }
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

fixSchoolsAndUsers();






