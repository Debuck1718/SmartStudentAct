// server.js
import dotenv from "dotenv";
dotenv.config();
console.log("🚀 Starting SmartStudentAct backend initialization...");

import http from "http";
import mongoose from "mongoose";
import Agenda from "agenda";
import fetch from "node-fetch";
import { app, eventBus } from "./app.js"; // ensure app.js exports `app`


const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0"; // ✅ Required for Render and most hosting platforms
const MONGO_URI = process.env.MONGODB_URI;
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

let agenda;
let isShuttingDown = false;
global.agendaStarted = false;

// ---------- MongoDB Connection ----------
const connectMongo = async () => {
  try {
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 20000,
    });
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
};

// ---------- Agenda Scheduler ----------
const startAgenda = async () => {
  try {
    agenda = new Agenda({
      db: { address: MONGO_URI, collection: "agendaJobs" },
      processEvery: "1 minute",
    });

    // Example background job
    agenda.define("test job", async () => {
      console.log(`⏳ Running test job at ${new Date().toISOString()}`);
    });

    await agenda.start();
    await agenda.every("1 minute", "test job");

    global.agendaStarted = true;
    console.log("📅 Agenda job scheduler started!");
  } catch (err) {
    console.error("❌ Agenda startup error:", err);
    throw err;
  }
};

// ---------- Start Application ----------
const startApp = async () => {
  try {
    await connectMongo();
    await startAgenda();

    const server = http.createServer(app);

    server.listen(PORT, HOST, () => {
      console.log(`🚀 SmartStudentAct API running at http://${HOST}:${PORT} [${NODE_ENV}]`);

      // Optional self-ping to prevent Render sleep
      if (isProd && process.env.RENDER_EXTERNAL_URL) {
        const url = process.env.RENDER_EXTERNAL_URL;
        console.log(`🌍 Self-pinging enabled for ${url}`);
        setInterval(async () => {
          try {
            const res = await fetch(url);
            if (res.ok) {
              console.log("🔄 Self-ping OK:", new Date().toISOString());
            } else {
              console.warn("⚠️ Self-ping response:", res.status);
            }
          } catch (err) {
            console.error("⚠️ Self-ping failed:", err.message);
          }
        }, 5 * 60 * 1000); // every 5 minutes
      }
    });

    // ---------- Graceful Shutdown ----------
    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n🚦 Received ${signal}. Starting graceful shutdown...`);

      try {
        await new Promise((resolve) => server.close(resolve));
        console.log("✅ HTTP server closed.");

        if (agenda) {
          await agenda.stop();
          console.log("✅ Agenda scheduler stopped.");
        }

        if (mongoose.connection.readyState === 1) {
          await mongoose.disconnect();
          console.log("✅ MongoDB disconnected.");
        }

        console.log("🟢 Shutdown complete. Exiting cleanly.");
        process.exit(0);
      } catch (err) {
        console.error("❌ Error during shutdown:", err);
        process.exit(1);
      }
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    process.exit(1);
  }
};

// ---------- Initialize App ----------
startApp().catch((err) => {
  console.error("❌ Uncaught error during application startup:", err);
  process.exit(1);
});











