// worker.js
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Agenda from "agenda";

const startWorker = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ MongoDB connected for Agenda Worker");

  const agenda = new Agenda({
    db: { address: process.env.MONGODB_URI, collection: "agendaJobs" },
    processEvery: "1 minute",
  });

  agenda.define("test job", async () => {
    console.log(`⏳ Running test job at ${new Date().toISOString()}`);
  });

  await agenda.start();
  await agenda.every("1 minute", "test job");

  console.log("📅 Agenda Worker started!");
};

startWorker().catch((err) => {
  console.error("❌ Worker failed:", err);
  process.exit(1);
});
