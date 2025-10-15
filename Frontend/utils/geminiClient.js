const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error('GEMINI_API_KEY missing');

const genAI = new GoogleGenerativeAI(API_KEY);

async function generateContent(prompt) {
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  const result = await model.generateContent(prompt);
  return { text: result.response.text() };
}

module.exports = { generateContent };
