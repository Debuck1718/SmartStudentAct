// server.js – SmartStudent Backend Startup (JWT-Only Edition)
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


const eventBus = new EventEmitter();

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

app.use(morgan("dev"));
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:4000",
        "https://smartstudentact.com",
        /.*\.smartstudentact\.com$/,
        /.*\.onrender\.com$/, 
      ];
      if (
        !origin ||
        allowedOrigins.some((pattern) =>
          typeof pattern === "string" ? pattern === origin : pattern.test(origin)
        )
      ) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Set-Cookie"],
    exposedHeaders: ["Set-Cookie"],
  })
);

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


async function connectMongo() {
  try {
    console.log(`📡 Connecting to MongoDB...`);
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
}

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
    throw err;
  }
}

// ───────────────────────────────────────────────
// 6️⃣ Routes
// ───────────────────────────────────────────────
try {
  const publicRoutes = require("./routes/publicRoutes");
  app.use("/api", publicRoutes(eventBus, agenda));

  const protectedRoutes = require("./routes/protectedRoutes");
  app.use("/api", protectedRoutes);


  console.log("✅ Routes loaded successfully!");
} catch (err) {
  console.error("❌ Routes loading error:", err);
  process.exit(1);
}


app.get("/", (req, res) => {
  res.json({ message: "SmartStudentAct Backend Running 🚀" });
});

app.use((err, req, res, next) => {
  if (NODE_ENV === "development") {
    console.error("❌ Global error handler caught:", err);
  }

  const statusCode = err.status || 500;
  const message = err.message || "An unexpected server error occurred.";

  res.status(statusCode).json({
    error: message,
    details: NODE_ENV === "development" ? err.stack : undefined,
  });
});


const server = http.createServer(app);

async function startApp() {
  try {
    await connectMongo();
    await startAgenda();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [${NODE_ENV}]`);
    });
  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    process.exit(1);
  }
}

startApp();
