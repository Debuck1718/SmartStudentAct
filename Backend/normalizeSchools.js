// normalizeSchools.js
const mongoose = require("mongoose");
const School = require("./models/School");

const MONGO_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://Smartstudentadmin:IAjFedj31EADYiZQ@cluster0.qtnlydx.mongodb.net/smartstudentact?retryWrites=true&w=majority";

// ISO mapping for countries
const countryMap = {
  GHANA: "GH",
  GH: "GH",
  ET: "ET",
  EG: "EG",
  KE: "KE",
  MA: "MA",
  NG: "NG",
  ZA: "ZA",
  TZ: "TZ",
  CI: "CI",
  ZM: "ZM",
  BW: "BW",
  CD: "CD",
  CM: "CM",
  NA: "NA",
  RW: "RW",
  TN: "TN",
};

// Mapping of known school name variants to canonical names
const schoolNameMap = {
  "Openlabs gh": "Openlabs Ghana",
  "Openlabs GH": "Openlabs Ghana",
  "Openlabs Ghana": "Openlabs Ghana",
  "Galaxy international school": "Galaxy International School",
  // Add more mappings here if needed
};

// Capitalize each word
function capitalizeWords(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Normalize school name using mapping and capitalization
function normalizeSchoolName(name) {
  if (!name) return name;
  if (schoolNameMap[name.trim()]) return schoolNameMap[name.trim()];
  return capitalizeWords(name);
}

async function normalizeSchools() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Database connected");

    const schools = await School.find({});
    console.log(`Found ${schools.length} schools.`);

    for (const school of schools) {
      const normalizedCountry =
        countryMap[school.schoolCountry?.toUpperCase()] || school.schoolCountry;
      const normalizedName = normalizeSchoolName(school.schoolName);

      // Check for duplicate after normalization
      const duplicate = await School.findOne({
        schoolName: normalizedName,
        schoolCountry: normalizedCountry,
      });

      if (duplicate && duplicate._id.toString() !== school._id.toString()) {
        console.log(
          `🗑 Found duplicate: merging ${school.schoolName} (${school.schoolCountry}) -> ${duplicate.schoolName} (${duplicate.schoolCountry})`
        );

        // Update users linked to this duplicate school
        await mongoose.model("User").updateMany(
          { school: school._id },
          { $set: { school: duplicate._id } }
        );

        // Remove the old duplicate
        await school.deleteOne();
      } else {
        // Update school with normalized values
        if (
          school.schoolCountry !== normalizedCountry ||
          school.schoolName !== normalizedName
        ) {
          console.log(
            `🔄 Normalizing ${school.schoolName}: ${school.schoolCountry} -> ${normalizedName} - ${normalizedCountry}`
          );
          school.schoolName = normalizedName;
          school.schoolCountry = normalizedCountry;
          await school.save();
        }
      }
    }

    console.log("🎯 School normalization completed.");
  } catch (err) {
    console.error("❌ Error normalizing schools:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔒 Database connection closed");
  }
}

normalizeSchools();
