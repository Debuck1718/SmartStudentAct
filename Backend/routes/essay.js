import express from "express";
import Joi from "joi";
import logger from "../utils/logger.js";
import { authenticateJWT } from "../middlewares/auth.js";
import checkSubscription from "../middlewares/checkSubscription.js";

const router = express.Router();

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";

// ===== Validation =====
const essaySchema = Joi.object({
  essayText: Joi.string().min(50).required(),
  citationData: Joi.object({
    accessDate: Joi.string().required(),
    source: Joi.string().required(),
    url: Joi.string().uri().required(),
    title: Joi.string().required(),
  }).optional(),
});

const detectSchema = Joi.object({
  text: Joi.string().min(20).required(),
});

// ===== Utils =====
function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function generateEssayPrompt(essayText, citationData) {
  const citationText = citationData
    ? `\nCitation:\n"${citationData.title}". ${citationData.source}, ${citationData.accessDate}, ${citationData.url}.`
    : "";
  return `
You are an academic writing tutor. Analyze:
1. Grammar & Spelling
2. Clarity
3. Argument
4. Tone

Return JSON:
{
  "grammar": [], "clarity": [], "argument": [], "style": []
}

Essay:
"${essayText}"
${citationText}
`;
}

function generateDetectPrompt(text) {
  return `
Analyze whether this text is AI-generated or human-written:
"${text}"

Return JSON:
{
  "analysis": "",
  "confidence": "High|Medium|Low",
  "verdict": "Likely AI-generated|Likely Human-written"
}`;
}

async function generateWithRetry(payload, retries = 3) {
  const apiUrl = `${API_URL}${process.env.GEMINI_API_KEY}`;
  for (let i = 1; i <= retries; i++) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = safeJSONParse(text);
      if (!parsed) throw new Error("Invalid JSON");
      return parsed;
    } catch (err) {
      logger.warn(`Gemini attempt ${i} failed: ${err.message}`);
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, i * 2000));
    }
  }
}

function splitEssay(text, max = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += max)
    chunks.push(text.slice(i, i + max));
  return chunks;
}

function mergeFeedback(arr) {
  return arr.reduce(
    (acc, f) => ({
      grammar: acc.grammar.concat(f.grammar || []),
      clarity: acc.clarity.concat(f.clarity || []),
      argument: acc.argument.concat(f.argument || []),
      style: acc.style.concat(f.style || []),
    }),
    { grammar: [], clarity: [], argument: [], style: [] }
  );
}

// ===== Routes =====
router.post("/check", authenticateJWT, checkSubscription, async (req, res) => {
  const { error, value } = essaySchema.validate(req.body);
  if (error)
    return res.status(400).json({ message: error.details[0].message });

  try {
    const chunks = splitEssay(value.essayText);
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const prompt = generateEssayPrompt(chunk, value.citationData);
        return generateWithRetry({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        });
      })
    );
    res.json({ feedback: mergeFeedback(results) });
  } catch (err) {
    logger.error("Essay check failed:", err);
    res
      .status(500)
      .json({ message: "Essay analysis failed. Try again later." });
  }
});

router.post("/detect", authenticateJWT, checkSubscription, async (req, res) => {
  const { error, value } = detectSchema.validate(req.body);
  if (error)
    return res.status(400).json({ message: error.details[0].message });

  try {
    const prompt = generateDetectPrompt(value.text);
    const result = await generateWithRetry({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    res.json({ result });
  } catch (err) {
    logger.error("AI detect failed:", err);
    res.status(500).json({ message: "Detection failed." });
  }
});

export default router;




