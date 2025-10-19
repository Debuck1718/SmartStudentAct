import http from "http";
import mongoose from "mongoose";
import Agenda from "agenda";
import fetch from "node-fetch";
import { app, eventBus } from "./app.js"; // ensure app.js exports `app`

const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0"; // ✅ Required by Render
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
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
};

// ---------- Agenda Scheduler ----------
const startAgenda = async () => {
  try {
    agenda = new Agenda({ db: { address: MONGO_URI, collection: "agendaJobs" } });

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

// ---------- Start the Server ----------
const startApp = async () => {
  try {
    await connectMongo();
    await startAgenda();

    const server = http.createServer(app);

    // ✅ Bind explicitly to 0.0.0.0
    server.listen(PORT, HOST, () => {
      console.log(`🚀 Server running at http://${HOST}:${PORT} [${NODE_ENV}]`);

      // Optional: safe self-ping for Render uptime
      if (isProd && process.env.RENDER_EXTERNAL_URL) {
        const url = process.env.RENDER_EXTERNAL_URL;
        console.log(`🌍 Self-pinging enabled for ${url}`);
        setInterval(async () => {
          try {
            await fetch(url);
            console.log("🔄 Self-ping successful:", new Date().toISOString());
          } catch (err) {
            console.error("⚠️ Self-ping failed:", err.message);
          }
        }, 5 * 60 * 1000);
      }
    });

    // ---------- Graceful Shutdown ----------
    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n🚦 Received ${signal}, starting graceful shutdown...`);

      try {
        await new Promise((resolve) => server.close(resolve));
        console.log("✅ Server closed. No new connections accepted.");

        if (agenda) {
          await agenda.stop();
          console.log("✅ Agenda job scheduler stopped.");
        }

        if (mongoose.connection.readyState === 1) {
          await mongoose.disconnect();
          console.log("✅ MongoDB disconnected.");
        }

        console.log("✅ Graceful shutdown complete. Exiting.");
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

startApp();













