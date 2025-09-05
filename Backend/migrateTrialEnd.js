const mongoose = require("mongoose");
const User = require("./models/User"); // adjust path if needed
require("dotenv").config();

async function migrateTrialEndDates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const result = await User.updateMany(
      {
        trial_end_date: { $exists: true },
        trial_end_at: { $exists: false },
      },
      [
        { $set: { trial_end_at: "$trial_end_date" } },
        { $unset: "trial_end_date" }
      ]
    );

    console.log(`🎉 Migration complete! Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    mongoose.disconnect();
  } catch (err) {
    console.error("❌ Migration error:", err);
    mongoose.disconnect();
  }
}

migrateTrialEndDates();

