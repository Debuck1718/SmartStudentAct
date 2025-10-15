// /api/lib/db.js
import mongoose from "mongoose";

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  const db = await mongoose.connect(uri);
  isConnected = db.connections[0].readyState === 1;
}
