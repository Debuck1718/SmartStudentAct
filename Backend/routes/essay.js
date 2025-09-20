const express = require("express");
const router = express.Router();
const Joi = require("joi");
const logger = require("../utils/logger");

const { authenticateJWT } = require("../middlewares/auth");
const checkSubscription = require("../middlewares/checkSubscription");

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";

// ===== Validation Schemas =====
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
  } catch (err) {
    logger.error("Failed to parse JSON:", err, "Text:", text);
    return null;
  }
}

function generateEssayPrompt(essayText, citationData) {
  const citationText = citationData
    ? `
**Citation**:
This feedback was generated using ${citationData.source} accessed on ${citationData.accessDate} from ${citationData.url}.
Use the following citation if required:
"${citationData.title}". ${citationData.source}, ${citationData.accessDate}, ${citationData.url}.`
    : "";

  return `
You are a helpful and detailed academic writing tutor. Analyze the following essay chunk and provide constructive feedback on:
1. Grammar & Spelling
2. Clarity & Coherence
3. Argument Strength
4. Tone & Style

Format response as JSON:
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

function generateDetectPrompt(text) {
  return `
You are an AI writing detector. Your job is to analyze whether the following text is AI-generated or human-written.

Text:
"${text}"

Respond strictly in JSON format:
{
  "analysis": "<brief explanation>",
  "confidence": "<High | Medium | Low>",
  "verdict": "<Likely AI-generated | Likely Human-written>"
}
`;
}

async function generateWithRetry(payload, retries = 3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("API key is not configured.");

  const apiUrlWithKey = `${API_URL}${apiKey}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(apiUrlWithKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          `API call failed with status ${response.status}: ${errorText}`
        );
        throw new Error(`API call failed with status ${response.status}`);
      }

      const result = await response.json();
      const generatedText =
        result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!generatedText) {
        throw new Error("Invalid or empty response from Gemini API.");
      }

      const parsed = safeJSONParse(generatedText);
      if (!parsed) throw new Error("Invalid JSON format in API response.");

      return parsed;
    } catch (err) {
      logger.warn(`Gemini API attempt ${attempt} failed:`, err.message);
      if (attempt === retries) {
        logger.error("All Gemini API attempts failed. Final error:", err);
        throw err;
      }
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ===== Essay Analyzer =====
router.post("/check", authenticateJWT, checkSubscription, async (req, res) => {
  const { error, value } = essaySchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ status: "Validation Error", message: error.details[0].message });
  }

  const { essayText, citationData } = value;

  try {
    const chunks = splitEssay(essayText);
    const feedbackPromises = chunks.map((chunk) => {
      const prompt = generateEssayPrompt(chunk, citationData);
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
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
      };
      return generateWithRetry(payload, 3);
    });

    const feedbackResults = await Promise.all(feedbackPromises);
    const feedback = mergeFeedback(feedbackResults);

    feedback.citation = citationData
      ? `"${citationData.title}". ${citationData.source}, ${citationData.accessDate}, ${citationData.url}.`
      : "";

    res.json({ feedback });
  } catch (err) {
    logger.error("Top-level error analyzing essay:", err);
    res
      .status(500)
      .json({ message: "Failed to analyze essay. Please try again later." });
  }
});

router.post("/detect", authenticateJWT, checkSubscription, async (req, res) => {
  const { error, value } = detectSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ status: "Validation Error", message: error.details[0].message });
  }

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

    const result = await generateWithRetry(payload, 3);
    res.json({ result });
  } catch (err) {
    logger.error("Top-level error detecting AI text:", err);
    res
      .status(500)
      .json({ message: "Failed to detect AI text. Please try again later." });
  }
});

// ===== Helpers =====
function splitEssay(essayText, maxChunkLength = 2000) {
  const chunks = [];
  let start = 0;
  while (start < essayText.length) {
    chunks.push(essayText.slice(start, start + maxChunkLength));
    start += maxChunkLength;
  }
  return chunks;
}

function mergeFeedback(feedbackArray) {
  const merged = { grammar: [], clarity: [], argument: [], style: [] };
  feedbackArray.forEach((f) => {
    merged.grammar.push(...(f.grammar || []));
    merged.clarity.push(...(f.clarity || []));
    merged.argument.push(...(f.argument || []));
    merged.style.push(...(f.style || []));
  });
  return merged;
}

module.exports = router;



