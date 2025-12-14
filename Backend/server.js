// server.js

import dotenv from "dotenv";
dotenv.config(); // Load .env before everything else

console.log("✅ Environment loaded, starting SmartStudentAct...");

import express from "express";
import mongoose from "mongoose";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { v2 as cloudinary } from "cloudinary";
import EventEmitter from "events";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";
import listEndpoints from "express-list-endpoints";
import http from "http";
import Agenda from "agenda";

import { authenticateJWT } from "./middlewares/auth.js";

// 1️⃣ Environment Validation
// ───────────────────────────────────────────────
const requiredEnvVars = [
  "PORT",
  "MONGODB_URI",
  "SESSION_SECRET",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing required env variable: ${key}`);
    process.exit(1);
  }
});

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
async function connectMongo() {
  try {
    console.log(`📡 Connecting to MongoDB at ${new Date().toISOString()}...`);
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    console.error(`❌ MongoDB connection error at ${new Date().toISOString()}:`, err);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────
// 5️⃣ Agenda Job Scheduler Setup
// ───────────────────────────────────────────────
let agenda;
async function startAgenda() {
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














