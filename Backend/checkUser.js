// checkSchools.js
const mongoose = require("mongoose");
const School = require("./models/School");

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://Smartstudentadmin:IAjFedj31EADYiZQ@cluster0.qtnlydx.mongodb.net/smartstudentact?retryWrites=true&w=majority";

async function checkSchools() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Database connected");

    const schools = await School.find().sort({ schoolName: 1 });
    console.log(`Found ${schools.length} schools:\n`);

    schools.forEach(school => {
      console.log(`${school.schoolName} -> ${school.schoolCountry}`);
    });
  } catch (err) {
    console.error("❌ Error fetching schools:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔒 Database connection closed");
  }
}

checkSchools();


