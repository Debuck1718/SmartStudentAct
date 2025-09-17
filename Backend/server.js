const http = require("http");
const mongoose = require("mongoose");
const Agenda = require("agenda");
const fetch = require("node-fetch");
const { app, eventBus } = require("./app");

const PORT = process.env.PORT || 8080;
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

// ---------- HTTP Server ----------
const server = http.createServer(app);

const startApp = async () => {
  try {
    await connectMongo();
    await startAgenda();

    // ✅ Dual-stack binding (IPv4 + IPv6)
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [${NODE_ENV}]`);

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
    });
  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    process.exit(1);
  }
};

// ---------- Root + Healthcheck ----------
app.get("/", (req, res) => {
  res.status(200).send("SmartStudentAct API is running 🚀");
});

app.get(["/health", "/healthz"], (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    mongo: mongoStatus,
    agenda: global.agendaStarted ? "running" : "stopped",
  });
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

startApp();












