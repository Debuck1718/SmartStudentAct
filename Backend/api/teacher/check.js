// api/teacher/check.js
import Joi from "joi";
import { authenticateJWT } from "@/middlewares/auth";
import checkSubscription from "@/middlewares/checkSubscription";
import logger from "@/utils/logger";

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";

const essaySchema = Joi.object({
  essayText: Joi.string().min(50).required(),
  citationData: Joi.object({
    accessDate: Joi.string().required(),
    source: Joi.string().required(),
    url: Joi.string().uri().required(),
    title: Joi.string().required(),
  }).optional(),
});

function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    logger.error("Invalid JSON:", text);
    return null;
  }
}

function generateEssayPrompt(essayText, citationData) {
  const citationText = citationData
    ? `\n**Citation**: "${citationData.title}". ${citationData.source}, ${citationData.accessDate}, ${citationData.url}.`
    : "";

  return `
You are an academic writing tutor. Analyze this essay chunk and give constructive feedback on:
1. Grammar & Spelling
2. Clarity & Coherence
3. Argument Strength
4. Tone & Style

Respond in JSON:
{
  "grammar": [],
  "clarity": [],
  "argument": [],
  "style": []
}

${citationText}

Essay chunk:
"${essayText}"
`;
}

async function generateWithRetry(payload, retries = 3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured.");
  const apiUrl = `${API_URL}${apiKey}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = safeJSONParse(text);
      if (parsed) return parsed;
    } catch (err) {
      logger.warn(`Attempt ${attempt} failed:`, err.message);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

function splitEssay(essayText, maxLen = 2000) {
  const chunks = [];
  for (let i = 0; i < essayText.length; i += maxLen)
    chunks.push(essayText.slice(i, i + maxLen));
  return chunks;
}

function mergeFeedback(results) {
  const merged = { grammar: [], clarity: [], argument: [], style: [] };
  results.forEach((f) => {
    merged.grammar.push(...(f.grammar || []));
    merged.clarity.push(...(f.clarity || []));
    merged.argument.push(...(f.argument || []));
    merged.style.push(...(f.style || []));
  });
  return merged;
}

export default async function handler(req, res) {
  await authenticateJWT(req, res);
  await checkSubscription(req, res);

  if (req.method !== "POST")
    return res.status(405).end(`Method ${req.method} Not Allowed`);

  const { error, value } = essaySchema.validate(req.body);
  if (error)
    return res
      .status(400)
      .json({ message: error.details[0].message, status: "Validation Error" });

  const { essayText, citationData } = value;

  try {
    const chunks = splitEssay(essayText);
    const feedbacks = await Promise.all(
      chunks.map((chunk) =>
        generateWithRetry({
          contents: [{ parts: [{ text: generateEssayPrompt(chunk, citationData) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                grammar: { type: "ARRAY", items: { type: "STRING" } },
                clarity: { type: "ARRAY", items: { type: "STRING" } },
                argument: { type: "ARRAY", items: { type: "STRING" } },
                style: { type: "ARRAY", items: { type: "STRING" } },
              },
            },
          },
        })
      )
    );

    const feedback = mergeFeedback(feedbacks);
    feedback.citation = citationData
      ? `"${citationData.title}". ${citationData.source}, ${citationData.accessDate}, ${citationData.url}.`
      : "";

    res.json({ feedback });
  } catch (err) {
    logger.error("Essay analysis error:", err);
    res.status(500).json({ message: "Failed to analyze essay." });
  }
}
