// server.web.js
import dotenv from "dotenv";
dotenv.config();
import http from "http";
import mongoose from "mongoose";
import { app } from "./app.js";

const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

const connectMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected for Web Service");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
};

const startServer = async () => {
  await connectMongo();
  const server = http.createServer(app);
  server.listen(PORT, HOST, () =>
    console.log(`🚀 API running at http://${HOST}:${PORT}`)
  );
};

startServer();












