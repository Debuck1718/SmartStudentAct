import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const envPath = fileURLToPath(new URL('./.env', import.meta.url));
dotenv.config({ path: envPath });
import mongoose from 'mongoose';
import User from './models/User.js';

async function main(){
  await mongoose.connect(process.env.MONGODB_URI);
  const u = await User.findOne({ email: 'vmensa564@gmail.com' }).lean();
  console.log('USER:', u);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
