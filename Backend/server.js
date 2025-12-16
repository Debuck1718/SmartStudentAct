// server.js

import dotenv from "dotenv";
// Explicitly resolve .env relative to this file so the backend loads its own .env
import { fileURLToPath } from "url";
import path from "path";
const envPath = fileURLToPath(new URL("./.env", import.meta.url));
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  console.warn("⚠️ dotenv failed to load Backend/.env:", dotenvResult.error.message);
} else {
  console.log("✅ dotenv loaded Backend/.env");
}

console.log("✅ Environment loaded, starting SmartStudentAct...");
// Debug: show whether key env vars loaded (values redacted)
console.log("Loaded env: MONGODB_URI:", !!process.env.MONGODB_URI);
console.log("Loaded env: BREVO_API_KEY:", !!process.env.BREVO_API_KEY);
console.log("Loaded env: VAPID_PUBLIC_KEY:", !!process.env.VAPID_PUBLIC_KEY, "VAPID_PRIVATE_KEY:", !!process.env.VAPID_PRIVATE_KEY);

import express from "express";
import mongoose from "mongoose";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { v2 as cloudinary } from "cloudinary";
import EventEmitter from "events";
import cors from "cors";
import fs from "fs";
import listEndpoints from "express-list-endpoints";
import http from "http";
import Agenda from "agenda";

import { authenticateJWT } from "./middlewares/auth.js";

// 1️⃣ Environment Validation
// ───────────────────────────────────────────────
// Require only the MongoDB URI for startup; warn for other recommended vars
if (!process.env.MONGODB_URI) {
  console.warn("⚠️ MONGODB_URI not set. Database features will be disabled until you set MONGODB_URI or start a MongoDB instance.");
}

// For local development, warn about but do not fatal for other recommended variables
const recommendedVars = [
  "SESSION_SECRET",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
const missingRecommended = recommendedVars.filter((k) => !process.env[k]);
if (missingRecommended.length) {
  console.warn(`⚠️ Missing recommended env vars: ${missingRecommended.join(", ")}. Some features may be limited.`);
}

// Provide safe defaults for session/JWT in development to avoid hard crashes
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "dev-session-secret";
  console.warn("⚠️ SESSION_SECRET not set. Using temporary default (dev-session-secret). Do not use this in production.");
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-jwt-secret";
  console.warn("⚠️ JWT_SECRET not set. Using temporary default (dev-jwt-secret). Do not use this in production.");
}

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGODB_URI;

// ───────────────────────────────────────────────
// 2️⃣ Express App Setup
// ───────────────────────────────────────────────
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ───────────────────────────────────────────────
// 3️⃣ Cloudinary Configuration
// ───────────────────────────────────────────────
// Configure Cloudinary with credentials from the .env file
try {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log("✅ Cloudinary configured successfully!");
} catch (error) {
  console.error("❌ Failed to configure Cloudinary. Check your .env file.", error);
  process.exit(1);
}

// ───────────────────────────────────────────────
// 4️⃣ MongoDB Connection with Logging
// ───────────────────────────────────────────────
let DB_CONNECTED = false;
async function connectMongo() {
  if (!MONGO_URI) {
    console.warn("⚠️ Skipping MongoDB connection because MONGODB_URI is not set.");
    DB_CONNECTED = false;
    return;
  }

  try {
    console.log(`📡 Connecting to MongoDB at ${new Date().toISOString()}...`);
    await mongoose.connect(MONGO_URI);
    DB_CONNECTED = true;
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    DB_CONNECTED = false;
    console.warn(`⚠️ MongoDB connection failed at ${new Date().toISOString()}: ${err.message}`);
    console.warn("Starting server in degraded mode. To enable database features, start a MongoDB instance or set MONGODB_URI in your environment.");
  }
}

// ───────────────────────────────────────────────
// 5️⃣ Agenda Job Scheduler Setup
// ───────────────────────────────────────────────
let agenda;
async function startAgenda() {
  if (!DB_CONNECTED) {
    console.warn("⚠️ Agenda will not start because MongoDB is not connected.");
    return;
  }

  try {
    agenda = new Agenda({
      db: { address: MONGO_URI, collection: "agendaJobs" },
    });

    agenda.define("test job", async () => {
      console.log(`⏳ Running test job at ${new Date().toISOString()}`);
    });

    await agenda.start();
    await agenda.every("1 minute", "test job");

    console.log("📅 Agenda job scheduler started!");
  } catch (err) {
    console.error(`❌ Agenda startup error at ${new Date().toISOString()}:`, err);
  }
}

// ───────────────────────────────────────────────
// 🧠 Event Bus Setup (Global EventEmitter)
// ───────────────────────────────────────────────
const eventBus = new EventEmitter();
eventBus.setMaxListeners(50); // optional, but good practice


// ───────────────────────────────────────────────
// 6️⃣ Routes Loader
// ───────────────────────────────────────────────
try {
  const { default: routes } = await import("./routes/index.js");
  routes(app, eventBus, agenda); // only pass what index.js expects
  console.log("✅ Routes loaded successfully!");
} catch (err) {
  console.error(`❌ Routes loading error at ${new Date().toISOString()}:`, err);
  process.exit(1);
}


// ───────────────────────────────────────────────
// 7️⃣ Root Route
// ────────────────────────────────────────────────

// compute __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve uploaded files (assignments, submissions, feedback)
app.use(
  "/uploads",
  express.static(path.join(__dirname, "routes", "uploads"), { maxAge: "1d" })
);

// Serve frontend static assets (for convenience in dev)
app.use(express.static(path.join(__dirname, "..", "Frontend", "public")));
app.get("/", (req, res) => {
  res.json({ message: "SmartStudentAct Backend Running 🚀" });
});

// ───────────────────────────────────────────────
// 8️⃣ Start Server
// ───────────────────────────────────────────────
(async () => {
  try {
    await connectMongo();
    await startAgenda();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (err) {
    console.error(`❌ Fatal startup error at ${new Date().toISOString()}:`, err);
    process.exit(1);
  }
})();














