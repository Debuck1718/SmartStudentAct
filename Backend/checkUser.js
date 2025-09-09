require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGODB_URI = "mongodb+srv://Smartstudentadmin:IAjFedj31EADYiZQ@cluster0.qtnlydx.mongodb.net/smartstudentact?retryWrites=true&w=majority";

async function listAllUsers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Database connected successfully.\n");

    const users = await User.find({}).lean();

    if (users.length === 0) {
      console.log("No users found in the database.");
    } else {
      console.log(`Found ${users.length} users:\n`);
      users.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email || "N/A"} | _id: ${user._id} | School: ${user.school || "N/A"} | Role: ${user.role || "N/A"}`);
      });
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\nDatabase connection closed.");
  }
}

listAllUsers();


