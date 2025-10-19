// app.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cloudinary = require("cloudinary").v2;
const EventEmitter = require("events");
const path = require("path");
const cors = require("cors");
const listEndpoints = require("express-list-endpoints");
const { authenticateJWT } = require("./middlewares/auth");

// ---------- Environment Validation ----------
const requiredEnvVars = [
  "MONGODB_URI",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const validateEnvVars = () => {
  const missingVars = requiredEnvVars.filter((key) => !process.env[key]);
  if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(", ")}`);
    process.exit(1);
  }
};
validateEnvVars();

// ---------- Core Setup ----------
const eventBus = new EventEmitter();
const app = express();
app.set("trust proxy", 1);

app.use(morgan("dev"));
app.use(
  helmet({
    contentSecurityPolicy: false,
    xssFilter: false,
  })
);
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------- CORS Configuration ----------
const allowedOrigins = [
  "https://www.smartstudentact.com",
  "https://smartstudentact.com",
  "http://localhost:3000",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn("🚫 Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Apply CORS globally
app.use(cors(corsOptions));
// ✅ Fix for preflight (OPTIONS) requests
app.options("*", cors(corsOptions));

// ---------- Cache-Control ----------
app.use((req, res, next) => {
  if (!req.path.startsWith("/public") && !req.path.startsWith("/uploads")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// ---------- Cloudinary Setup ----------
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

// ---------- Static Files ----------
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "30d",
    immutable: true,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    },
  })
);

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "7d",
    immutable: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=604800");
    },
  })
);

// ---------- Routes ----------
try {
  const publicRoutes = require("./routes/publicRoutes");
  const webhookRoutes = require("./routes/webhookRoutes");
  const pushRoutes = require("./routes/pushRoutes");
  const protectedRoutes = require("./routes/protectedRoutes");

  // Public routes (no authentication)
  app.use("/", publicRoutes);
  app.use("/api", webhookRoutes);
  app.use("/api/push", pushRoutes);

  // Authenticated routes (JWT required)
  app.use("/api", authenticateJWT, protectedRoutes);

  console.log("✅ Routes loaded successfully!");
} catch (err) {
  console.error("❌ Routes loading error:", err);
  process.exit(1);
}

// ---------- Root + Healthcheck ----------
app.get("/", (req, res) => {
  res.json({ message: "SmartStudentAct Backend Running 🚀" });
});

app.get(["/health", "/healthz"], (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    mongo: mongoStatus,
  });
});

// ---------- Debug: List Registered Routes ----------
if (process.env.NODE_ENV !== "production") {
  console.table(listEndpoints(app));
}

// ---------- Global Error Handler ----------
app.use((err, req, res, next) => {
  console.error("❌ Global error handler caught:", err);
  const statusCode = err.status || 500;
  const message = err.message || "An unexpected server error occurred.";
  res.status(statusCode).json({
    error: message,
    details: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

module.exports = { app, eventBus };



