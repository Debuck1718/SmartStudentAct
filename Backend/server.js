// server.js — root startup file
import dotenv from "dotenv";
dotenv.config(); // Load .env before any imports

console.log("✅ Environment loaded, starting SmartStudentAct...");

// Safely import your actual main app
console.log("🔍 Importing main.js...");
import("./main.js")
  .then(() => {
    console.log("🚀 Main app successfully imported!");
  })
  .catch((err) => {
    console.error("❌ Failed to import main.js:", err);
    console.error("STACK TRACE:", err.stack);
  });
