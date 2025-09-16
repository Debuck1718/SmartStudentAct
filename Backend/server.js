const http = require("http");
const mongoose = require("mongoose");
const Agenda = require("agenda");
const { app } = require("./app"); // Assuming app is exported from a separate file

const PORT = process.env.PORT || 3000; // Use a fallback port
const MONGO_URI = process.env.MONGODB_URI;

// Function to connect to MongoDB
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

// Function to start the Agenda job scheduler
let agenda;
const startAgenda = async () => {
  try {
    agenda = new Agenda({ db: { address: MONGO_URI, collection: "agendaJobs" } });
    await agenda.start();
    console.log("📅 Agenda job scheduler started!");
  } catch (err) {
    console.error("❌ Agenda startup error:", err);
    throw err;
  }
};

const server = http.createServer(app);
let isShuttingDown = false;

// Main startup function
const startApp = async () => {
  try {
    await connectMongo();
    await startAgenda();
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
};

// --- Health Check Endpoint ---
app.get(["/health", "/healthz"], async (req, res) => {
  try {
    if (isShuttingDown) {
      return res.status(503).json({
        status: "shutting_down",
        message: "Service is shutting down",
      });
    }

    const mongooseConnectionState = mongoose.connection.readyState;
    if (mongooseConnectionState !== 1) { // 1 represents 'connected'
      return res.status(503).json({
        status: "database_disconnected",
        message: "Database connection unavailable",
      });
    }

    // You may need to await agenda.running() if it's an async function
    if (agenda && !(await agenda.running())) {
      return res.status(503).json({
        status: "scheduler_not_running",
        message: "Job scheduler not running",
      });
    }

    // All checks passed
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "error",
      message: "Health check failed due to an internal error.",
      error: error.message,
    });
  }
});

// --- Graceful Shutdown ---
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🚦 Received ${signal}, starting graceful shutdown...`);
  try {
    await new Promise((resolve) => server.close(resolve));
    if (agenda) await agenda.stop();
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
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









