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
const session = require("express-session");
const MongoStore = require("connect-mongo");
const cookieParser = require("cookie-parser"); // ✅ Added cookie-parser

// ✅ CSRF middleware
const csrfProtection = require("./middlewares/csrf");

// ───────────────────────────────────────────────
// 1️⃣ Environment Validation
// ───────────────────────────────────────────────────
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
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

// ───────────────────────────────────────────────
// 2️⃣ Express App Setup
// ───────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1); // ✅ trust proxy for HTTPS + cookies

// ❌ FIX: Update CORS configuration to handle dynamic origins in development
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // server-to-server
      // ✅ Allow any origin that ends with .onrender.com or smartstudentact.com
      const isAllowed = isProd
        ? origin.endsWith(".smartstudentact.com")
        : origin.endsWith(".onrender.com") || origin === "http://localhost:3000";

      if (isAllowed) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // ✅ Use the cookie-parser middleware here

// ───────────────────────────────────────────────
// 3️⃣ Session Middleware
// ───────────────────────────────────────────────
app.use(
  session({
    name: "ssid", // custom cookie name
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60, // 14 days
    }),
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      domain: isProd ? ".smartstudentact.com" : undefined,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    },
  })
);

// ───────────────────────────────────────────────
// 4️⃣ Cloudinary
// ───────────────────────────────────────────────
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

// ───────────────────────────────────────────────
// 5️⃣ MongoDB
// ───────────────────────────────────────────────
async function connectMongo() {
  try {
    console.log(`📡 Connecting to MongoDB at ${new Date().toISOString()}...`);
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

// ───────────────────────────────────────────────
// 6️⃣ Agenda Jobs
// ───────────────────────────────────────────────
let agenda;
async function startAgenda() {
  try {
    agenda = new Agenda({ db: { address: MONGO_URI, collection: "agendaJobs" } });

    agenda.define("test job", async () => {
      console.log(`⏳ Running test job at ${new Date().toISOString()}`);
    });

    await agenda.start();
    await agenda.every("1 minute", "test job");

    console.log("📅 Agenda job scheduler started!");
  } catch (err) {
    console.error("❌ Agenda startup error:", err);
  }
}

// ───────────────────────────────────────────────
// 7️⃣ Routes
// ───────────────────────────────────────────────
try {
  // ✅ Mount public routes first
  const publicRoutes = require("./routes/publicRoutes");
  app.use("/", publicRoutes(eventBus, agenda));

  // ✅ Mount protected routes under /api
  const protectedRoutes = require("./routes/protectedRoutes");
  app.use("/api", csrfProtection, protectedRoutes);

  console.log("✅ Routes loaded successfully!");
} catch (err) {
  console.error("❌ Routes loading error:", err);
  process.exit(1);
}

// ───────────────────────────────────────────────
// 8️⃣ Root Route
// ───────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "SmartStudentAct Backend Running 🚀" });
});

// ───────────────────────────────────────────────
// 9️⃣ Global Error Handler
// ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Global error handler caught:", err.stack);
  res.status(err.status || 500).json({
    error: "An unexpected server error occurred.",
    details: NODE_ENV === "development" ? err.message : undefined,
  });
});

// ───────────────────────────────────────────────
// 🔟 Start Server
// ───────────────────────────────────────────────
(async () => {
  try {
    await connectMongo();
    await startAgenda();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [${NODE_ENV}]`);
    });
  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    process.exit(1);
  }
})();
