import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const envPath = fileURLToPath(new URL('./.env', import.meta.url));
dotenv.config({ path: envPath });
import mongoose from 'mongoose';
import User from './models/User.js';

async function main(){
  await mongoose.connect(process.env.MONGODB_URI);
  const u = await User.findOne({ email: 'afedziesylvanus@gmail.com' }).lean();
  if (!u) {
    console.log('❌ User not found');
  } else {
    console.log('USER:', u);
    // Highlight key fields
    console.log('occupation:', u.occupation);
    console.log('teacherGrade:', u.teacherGrade);
    console.log('teacherSubject:', u.teacherSubject);
    console.log('school:', u.school);
    // List missing/invalid fields
    const missing = [];
    if (!u.occupation) missing.push('occupation');
    if (!u.teacherGrade || !Array.isArray(u.teacherGrade) || u.teacherGrade.length === 0) missing.push('teacherGrade');
    if (!u.teacherSubject) missing.push('teacherSubject');
    if (!u.school) missing.push('school');
    if (missing.length) {
      console.log('❗ Missing or invalid fields:', missing);
    } else {
      console.log('✅ All key fields present and valid.');
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
