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
import cors from "cors";
import listEndpoints from "express-list-endpoints";
import http from "http";

import { authenticateJWT } from "./middlewares/auth.js";

// ---------- Core Setup ----------
const app = express(); // ✅ must be defined before dynamic imports
const eventBus = new EventEmitter();
const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(morgan("dev"));
app.use(
  helmet({
    contentSecurityPolicy: false,
    xssFilter: false,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------- CORS ----------
const allowedOrigins = [
  "https://www.smartstudentact.com",
  "https://smartstudentact.com",
  "http://localhost:3000",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
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

// ---------- Cloudinary ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log("✅ Cloudinary configured successfully!");

// ---------- Static Files ----------
app.use(
  express.static(path.join(process.cwd(), "public"), {
    maxAge: "30d",
    immutable: true,
  })
);
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    maxAge: "7d",
  })
);

// ---------- Dynamic Route Import (SAFE ORDER) ----------
console.log("--- STARTUP PHASE 2: Importing Routes ---");

const tryImport = async (label, routePath, mountPath) => {
  try {
    console.log(`🔍 Importing ${label} from ${routePath} ...`);
    const mod = (await import(routePath)).default;
    console.log(`🧩 Mounting ${label} at "${mountPath}"`);
    app.use(mountPath, mod);
    console.log(`✅ Loaded ${label} at ${mountPath}`);
  } catch (err) {
    console.error(`❌ Error in ${label} (${routePath})`);
    console.error("MESSAGE:", err.message);
    console.error("STACK:", err.stack);
    console.error("🔎 HINT: Look for malformed route path (missing '/' or malformed ':param').");
  }
};


await tryImport("Public Routes", "./routes/publicRoutes.js", "/");
console.log("✅ Finished Public Routes");

await tryImport("Webhook Routes", "./routes/webhookRoutes.js", "/api");
console.log("✅ Finished Webhook Routes");

await tryImport("Push Routes", "./routes/pushRoutes.js", "/api/push");
console.log("✅ Finished Push Routes");

await tryImport("Protected Routes", "./routes/protectedRoutes.js", "/api");
console.log("✅ Finished Protected Routes");

// ---------- Health & Root Routes ----------
app.get("/", (req, res) => {
  res.json({ message: "SmartStudentAct Backend Running 🚀" });
});

app.get(["/health", "/healthz"], (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// ---------- Global Error Handler ----------
app.use((err, req, res, next) => {
  console.error("❌ Global error handler caught:", err);
  res.status(err.status || 500).json({ error: err.message });
});

// ---------- Environment Validation ----------
const requiredEnvVars = [
  "MONGODB_URI",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}
console.log("✅ Environment variables validated.");

// ---------- MongoDB Connection + Server Start ----------
const startServer = async () => {
  try {
    console.log("📡 Attempting to connect to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 20000,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected for Web Service");

    const server = http.createServer(app);
    server.listen(PORT, HOST, () =>
      console.log(`🚀 API running at http://${HOST}:${PORT}`)
    );

    if (process.env.NODE_ENV !== "production") {
      console.table(listEndpoints(app));
    }
  } catch (err) {
    console.error(
      "❌ FATAL ASYNC FAILURE: MongoDB connection failed:",
      err.message || err
    );
    setTimeout(() => process.exit(1), 1000);
  }
};

startServer();











