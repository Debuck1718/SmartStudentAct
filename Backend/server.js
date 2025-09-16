const http = require("http");
const mongoose = require("mongoose");
const Agenda = require("agenda");
const { app, eventBus } = require("./app");

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGODB_URI;
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

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
    throw err;
  }
};

const server = http.createServer(app);
let isShuttingDown = false;

const startApp = async () => {
  try {
    await connectMongo();
    await startAgenda();

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT} [${NODE_ENV}]`);
    });
  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    process.exit(1);
  }
};

app.get("/", (req, res) => {
  res.status(200).send("SmartStudentAct API is running 🚀");
});

// Corrected health check
app.get(["/health", "/healthz"], (req, res) => {
  // Check if the MongoDB connection is ready (readyState 1 = connected)
  if (mongoose.connection.readyState === 1) {
    res.status(200).json({
      status: "ok",
      message: "Service is ready to handle requests.",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } else {
    // Return a 503 status code if the service is not ready
    res.status(503).json({
      status: "not ready",
      message: "Service is still starting up or database is not connected.",
    });
  }
});

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








