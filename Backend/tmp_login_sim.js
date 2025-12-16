import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const envPath = fileURLToPath(new URL('./.env', import.meta.url));
dotenv.config({ path: envPath });
import mongoose from 'mongoose';
import User from './models/User.js';
import { generateAccessToken, generateRefreshToken } from './middlewares/auth.js';

async function sim(){
  await mongoose.connect(process.env.MONGODB_URI);
  const email = 'vmensa564@gmail.com';
  const password = 'Victoria123%';
  console.log('fetching user', email);
  const user = await User.findOne({ email }).select('+password');
  console.log('got user', user._id.toString());
  const match = await user.comparePassword(password);
  console.log('password match?', match);
  const now = new Date();
  if (user.subscription_status === 'active' && user.payment_date) {
    console.log('checking subscription active');
  }
  if (user.is_on_trial && user.trial_end_at) {
    const trialActive = now < new Date(user.trial_end_at);
    console.log('trialActive', trialActive);
    if (!trialActive) {
      console.log('ending trial (updateOne)');
      await User.updateOne({ _id: user._id }, { $set: { is_on_trial: false, subscription_status: 'inactive' } }, { runValidators:false });
    }
  }
  const access = generateAccessToken(user);
  const refresh = generateRefreshToken(user);
  console.log('tokens generated');
  await User.updateOne({ _id: user._id }, { $set: { refreshToken: refresh } }, { runValidators: false });
  console.log('refresh saved');
  process.exit(0);
}

sim().catch(e=>{ console.error('ERR', e); process.exit(1);});