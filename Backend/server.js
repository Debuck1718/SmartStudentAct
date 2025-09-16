const http = require("http");
const mongoose = require("mongoose");
const Agenda = require("agenda");
const { app, eventBus } = require("./app");

const PORT = process.env.PORT;
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

app.get(["/health", "/healthz"], async (req, res) => {
  try {
    if (isShuttingDown) {
      return res.status(503).json({
        status: "shutting_down",
        message: "Service is shutting down",
      });
    }

    const mongooseConnectionState = mongoose.connection.readyState;
    if (mongooseConnectionState !== 1) {
      return res.status(503).json({
        status: "database_disconnected",
        message: "Database connection unavailable",
      });
    }

    if (agenda && !(await agenda.running())) {
      return res.status(503).json({
        status: "scheduler_not_running",
        message: "Job scheduler not running",
      });
    }

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








