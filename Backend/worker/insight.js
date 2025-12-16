// api/worker/insight.js
import dbConnect from "../lib/db.js";
import Worker from "../models/Worker.js";
import { authenticateJWT } from "../middlewares/auth.js";
import logger from "../utils/logger.js";

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";

async function generateInsight(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured.");
  const res = await fetch(`${API_URL}${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export default async function handler(req, res) {
  await dbConnect();
  await authenticateJWT(req, res);

  if (req.method !== "GET")
    return res.status(405).end(`Method ${req.method} Not Allowed`);

  try {
    const userId = req.userId;
    const worker = await Worker.findOne({ user_id: userId });

    if (!worker)
      return res.status(404).json({ message: "Worker data not found." });

    const prompt = `
You are an AI advisor for professionals. Analyze the following worker's data and return actionable insights as JSON.

Worker Profile:
${JSON.stringify({
  goals: worker.goals,
  finance: worker.finance,
  motivation_level: worker.motivation_level,
  productivity: worker.productivity,
  reflection_notes: worker.reflection_notes.slice(-3),
})}

Respond strictly as JSON:
{
  "goalInsight": "string",
  "financeInsight": "string",
  "motivationInsight": "string",
  "adviceSummary": "string"
}
`;

    const insights = await generateInsight(prompt);
    res.status(200).json({ insights });
  } catch (error) {
    logger.error("Error generating worker insight:", error);
    res.status(500).json({ message: "Failed to generate worker insights." });
  }
}
