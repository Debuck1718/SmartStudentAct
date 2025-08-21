// server.js – SmartStudent Backend Startup
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const Agenda = require("agenda");
const EventEmitter = require("events");
const eventBus = new EventEmitter();
const cloudinary = require("cloudinary").v2;

// ───────────────────────────────────────────────
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
// 6️⃣ Routes Loader
// ───────────────────────────────────────────────
try {
    const { publicRouter, protectedRouter } = require("./routes")(app, mongoose, eventBus, agenda, cloudinary);

    // Apply the checkSubscription middleware to the protected router ONLY
    protectedRouter.use(require('./middlewares/checkSubscription'));

    // ✅ FIX: Mount public routes BEFORE protected routes.
    app.use("/api", publicRouter); // Routes like /users/login and /users/signup
    app.use("/api", protectedRouter); // All other authenticated routes

    console.log("✅ Routes loaded successfully!");
} catch (err) {
    console.error(`❌ Routes loading error at ${new Date().toISOString()}:`, err);
    process.exit(1);
}

// ───────────────────────────────────────────────
// 7️⃣ Root Route
// ────────────────────────────────────────────────
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


