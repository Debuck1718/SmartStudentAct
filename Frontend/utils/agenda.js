const Agenda = require("agenda");
const logger = require("./logger");

if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing for Agenda");

const agenda = new Agenda({
  db: { address: process.env.MONGO_URI, collection: "agendaJobs" },
  processEvery: "30 seconds",
});

agenda.on("ready", async () => logger.info("✅ Agenda ready"));
agenda.on("error", (err) => logger.error("❌ Agenda error:", err));

module.exports = agenda;
