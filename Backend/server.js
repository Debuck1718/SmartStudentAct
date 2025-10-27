import dotenv from "dotenv";
dotenv.config();
import http from "http";
import mongoose from "mongoose";
import { app } from "./app.js";

const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

const connectMongo = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("❌ Missing MONGODB_URI environment variable");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected for Web Service");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
};

const startServer = async () => {
  console.log("🧾 Loaded ENV:", {
    MONGODB_URI: !!process.env.MONGODB_URI,
    BREVO_API_KEY: !!process.env.BREVO_API_KEY,
    JWT_SECRET: !!process.env.JWT_SECRET,
    PORT,
  });

  await connectMongo();

  const server = http.createServer(app);
  server.listen(PORT, HOST, () =>
    console.log(`🚀 API running at http://${HOST}:${PORT}`)
  );
};

startServer();










