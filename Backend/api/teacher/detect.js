// api/teacher/detect.js
import Joi from "joi";
import { authenticateJWT } from "@/middlewares/auth";
import checkSubscription from "@/middlewares/checkSubscription";
import logger from "@/utils/logger";

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";

const detectSchema = Joi.object({
  text: Joi.string().min(20).required(),
});

function generateDetectPrompt(text) {
  return `
You are an AI writing detector. Analyze whether this text is AI-generated or human-written.

Text:
"${text}"

Respond strictly as JSON:
{
  "analysis": "<brief explanation>",
  "confidence": "<High | Medium | Low>",
  "verdict": "<Likely AI-generated | Likely Human-written>"
}
`;
}

async function generateWithRetry(payload, retries = 3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");
  const apiUrl = `${API_URL}${apiKey}`;

  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(text);
    } catch (err) {
      logger.warn(`Attempt ${i} failed:`, err.message);
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, i * 1000));
    }
  }
}

export default async function handler(req, res) {
  await authenticateJWT(req, res);
  await checkSubscription(req, res);

  if (req.method !== "POST")
    return res.status(405).end(`Method ${req.method} Not Allowed`);

  const { error, value } = detectSchema.validate(req.body);
  if (error)
    return res
      .status(400)
      .json({ message: error.details[0].message, status: "Validation Error" });

  const { text } = value;

  try {
    const prompt = generateDetectPrompt(text);
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            analysis: { type: "STRING" },
            confidence: { type: "STRING" },
            verdict: { type: "STRING" },
          },
        },
      },
    };

    const result = await generateWithRetry(payload);
    res.json({ result });
  } catch (err) {
    logger.error("AI detection failed:", err);
    res.status(500).json({ message: "Failed to detect AI text." });
  }
}
