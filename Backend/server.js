const http = require("http");
const mongoose = require("mongoose");
const Agenda = require("agenda");
const fetch = require("node-fetch");
const { app } = require("./app");

// PORT must come from environment for Railway
const PORT = process.env.PORT;
if (!PORT) {
  console.error("❌ PORT not defined. Exiting...");
  process.exit(1);
}

const MONGO_URI = process.env.MONGODB_URI;
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

// ---------- Health Route ----------
const healthRouter = require("express").Router();
healthRouter.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
app.use(healthRouter);

// ---------- MongoDB Connection ----------
const connectMongo = async () => {
  try {
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
};

// ---------- Agenda Job Scheduler ----------
let agenda;
const startAgenda = async () => {
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
};

// ---------- HTTP Server ----------
const server = http.createServer(app);
let isShuttingDown = false;

// Start HTTP server immediately so health checks pass
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT} [${NODE_ENV}]`);

  // Start MongoDB and Agenda asynchronously
  (async () => {
    await connectMongo();
    await startAgenda();
  })();

  // Optional: self-ping to prevent idling in prod
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

// ---------- Root Route ----------
app.get("/", (req, res) => {
  res.status(200).send("SmartStudentAct API is running 🚀");
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
  } catch (err) {
    console.error("❌ Error during shutdown:", err);
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);








