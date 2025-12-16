import mongoose from "mongoose";
import logger from "../utils/logger.js";

export async function connectDB() {
  const MONGO_URI = process.env.MONGODB_URI;
  if (!MONGO_URI) {
    throw new Error("MONGODB_URI environment variable is not set.");
  }

  if (mongoose.connection.readyState === 1) {
    // Already connected
    return;
  }

  try {
    await mongoose.connect(MONGO_URI);
    logger.info("MongoDB connected");
  } catch (err) {
    logger.error("MongoDB connection error:", err);
    throw err;
  }
}

export default connectDB;
