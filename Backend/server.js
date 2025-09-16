const http = require("http");
const mongoose = require("mongoose");
const Agenda = require("agenda");
const fetch = require("node-fetch");
const { app } = require("./app");

// ---------- Environment ----------
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGODB_URI;
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

// ---------- Health Route (always ready) ----------
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ---------- Root Route ----------
app.get("/", (_req, res) => {
  res.status(200).send("SmartStudentAct API is running 🚀");
});

// ---------- HTTP Server ----------
const server = http.createServer(app);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT} [${NODE_ENV}]`);
});

// ---------- Asynchronous Startup (MongoDB + Agenda) ----------
let agenda;
(async () => {
  try {
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully!");

    agenda = new Agenda({ db: { address: MONGO_URI, collection: "agendaJobs" } });
    agenda.define("test job", async () => {
      console.log(`⏳ Running test job at ${new Date().toISOString()}`);
    });
    await agenda.start();
    await agenda.every("1 minute", "test job");
    console.log("📅 Agenda job scheduler started!");

    // Optional: self-ping to prevent idling in production
    if (isProd && process.env.RENDER_EXTERNAL_URL) {
      setInterval(async () => {
        try {
          await fetch(process.env.RENDER_EXTERNAL_URL);
          console.log("🔄 Self-ping successful:", new Date().toISOString());
        } catch (err) {
          console.error("⚠️ Self-ping failed:", err.message);
        }
      }, 5 * 60 * 1000);
    }
  } catch (err) {
    console.error("❌ Startup error:", err);
  }
})();

// ---------- Graceful Shutdown ----------
let isShuttingDown = false;
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
  } catch (err) {
    console.error("❌ Error during shutdown:", err);
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);









