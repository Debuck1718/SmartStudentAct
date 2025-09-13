// fillMissingUserSchoolInfo.js
const mongoose = require("mongoose");
const User = require("./models/User");
const School = require("./models/School");

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://Smartstudentadmin:IAjFedj31EADYiZQ@cluster0.qtnlydx.mongodb.net/smartstudentact?retryWrites=true&w=majority";

async function fillUserSchoolInfo() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Database connected");

    const users = await User.find({ $or: [{ schoolName: { $exists: false } }, { schoolCountry: { $exists: false } }] });
    console.log(`Found ${users.length} users with missing school info.`);

    let updatedCount = 0;

    for (const user of users) {
      if (!user.school) {
        console.log(`⚠️ Skipping ${user.email}: no school reference`);
        continue;
      }

      const school = await School.findById(user.school);
      if (!school) {
        console.log(`⚠️ Skipping ${user.email}: school ID ${user.school} not found`);
        continue;
      }

      user.schoolName = school.schoolName;
      user.schoolCountry = school.schoolCountry;
      await user.save();
      updatedCount++;
      console.log(`✅ Updated ${user.email} with school info: ${school.schoolName}, ${school.schoolCountry}`);
    }

    console.log(`\n🎯 Done! Updated ${updatedCount} users.`);
  } catch (err) {
    console.error("❌ Error updating users:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔒 Database connection closed");
  }
}

fillUserSchoolInfo();





