require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const Agenda = require("agenda");
const EventEmitter = require("events");
const cookieParser = require("cookie-parser");
const cloudinary = require("cloudinary").v2;
const http = require("http");
const fetch = require("node-fetch");
const path = require("path");

const eventBus = new EventEmitter();

/* --------------------- ✅ Environment Variable Check --------------------- */
const requiredEnvVars = [
  "PORT",
  "MONGODB_URI",
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
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);

/* ---------------------------- ✅ Middleware ----------------------------- */
app.use(morgan("dev"));
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ---------------------------- ✅ CORS Setup ----------------------------- */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:4000",
  "https://smartstudentact.com",
  "https://www.smartstudentact.com",
  "https://api.smartstudentact.com",
];

// Debug incoming origin
app.use((req, res, next) => {
  console.log("🌐 Incoming request origin:", req.headers.origin || "N/A");
  next();
});

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser clients
    if (allowedOrigins.includes(origin)) return callback(null, true);

    console.warn(`❌ CORS blocked request from: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["Set-Cookie"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Always respond to preflight

/* ------------------------- ✅ Cloudinary Config ------------------------- */
try {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log("✅ Cloudinary configured successfully!");
} catch (error) {
  console.error("❌ Cloudinary config error", error);
  process.exit(1);
}

/* ------------------------- 📡 MongoDB Connection ------------------------ */
async function connectMongo() {
  try {
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    throw err;
  }
}

/* ------------------------- 📅 Agenda Scheduler -------------------------- */
let agenda;
async function startAgenda() {
  try {
    console.log("📅 Initializing Agenda...");
    agenda = new Agenda({ db: { address: MONGO_URI, collection: "agendaJobs" } });

    agenda.define("test job", async () => {
      console.log(`⏳ Running test job at ${new Date().toISOString()}`);
    });

    await agenda.start();
    await agenda.every("1 minute", "test job");

    console.log("✅ Agenda job scheduler started!");
  } catch (err) {
    console.error("❌ Agenda startup error:", err.message);
    throw err;
  }
}

/* ----------------------------- 🚦 Routes ------------------------------- */
function loadRoutes(appInstance) {
  try {
    const publicRoutes = require("./routes/publicRoutes");
    appInstance.use("/", publicRoutes(eventBus, agenda));

    const webhookRoutes = require("./routes/webhookRoutes");
    appInstance.use("/api", webhookRoutes);

    const pushRoutes = require("./routes/pushRoutes");
    appInstance.use("/api/push", pushRoutes);

    const protectedRoutes = require("./routes/protectedRoutes");
    appInstance.use("/api", protectedRoutes);

    console.log("✅ Routes loaded successfully!");
  } catch (err) {
    console.error("❌ Routes loading error:", err);
    throw err;
  }
}

/* ----------------------------- ✅ Health Check ----------------------------- */
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/* ---------------------- ✅ Global Error Handler ------------------------ */
app.use((err, req, res, next) => {
  console.error("❌ Global error handler caught:", err);
  res.status(err.status || 500).json({
    error: err.message || "An unexpected server error occurred.",
    details: NODE_ENV === "development" ? err.stack : undefined,
  });
});

const server = http.createServer(app);

// Global handler for unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

/* ----------------------------- 🚀 Start App ---------------------------- */
async function startApp() {
  try {
    console.log("🚀 Starting SmartStudentAct backend...");

    await connectMongo();
    await startAgenda();

    loadRoutes(app);

    // Serve frontend (AFTER API routes to prevent override)
    app.use(express.static(path.join(__dirname, "client", "build")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "client", "build", "index.html"));
    });

    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT} [${NODE_ENV}]`);

      // Self-ping to keep dyno awake
      if (isProd && process.env.RENDER_EXTERNAL_URL) {
        setInterval(async () => {
          try {
            const res = await fetch(process.env.RENDER_EXTERNAL_URL + "/health");
            console.log("🔄 Self-ping:", res.status, new Date().toISOString());
          } catch (err) {
            console.error("⚠️ Self-ping failed:", err.message);
          }
        }, 5 * 60 * 1000);
      }
    });
  } catch (err) {
    console.error("❌ Fatal startup error:", err.message);
    console.error(err.stack);
  }
}

startApp();







