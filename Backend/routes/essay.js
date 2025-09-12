const express = require("express");
const router = express.Router();
const Joi = require("joi");
const logger = require("../utils/logger");
const geminiClient = require("../utils/geminiClient");

const { authenticateJWT } = require("../middlewares/auth");
const checkSubscription = require("../middlewares/checkSubscription");

// --- Validation schema
const essaySchema = Joi.object({
  essayText: Joi.string().min(50).required(),
  citationData: Joi.object({
    accessDate: Joi.string().required(),
    source: Joi.string().required(),
    url: Joi.string().uri().required(),
    title: Joi.string().required(),
  }).optional(),
});

// --- Safe JSON parse
function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    logger.error("Failed to parse JSON:", err, "Text:", text);
    return null;
  }
}

// --- Generate prompt
function generatePrompt(essayText, citationData) {
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

// --- Retry wrapper
async function generateFeedbackWithRetry(payload, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await geminiClient.generateContent(payload);
      const feedback = safeJSONParse(result.text);
      if (!feedback) throw new Error("Invalid JSON from Gemini API");
      return feedback;
    } catch (err) {
      logger.warn(`Gemini API attempt ${attempt} failed:`, err);
      if (attempt === retries) throw err;
    }
  }
}

// --- Split long essay into chunks (~2000 chars per chunk)
function splitEssay(essayText, maxChunkLength = 2000) {
  const chunks = [];
  let start = 0;
  while (start < essayText.length) {
    chunks.push(essayText.slice(start, start + maxChunkLength));
    start += maxChunkLength;
  }
  return chunks;
}

// --- Merge feedback arrays
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

// --- Route
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
    const feedbackArray = [];

    for (const chunk of chunks) {
      const prompt = generatePrompt(chunk, citationData);
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
      const feedbackChunk = await generateFeedbackWithRetry(payload, 3);
      feedbackArray.push(feedbackChunk);
    }

    const feedback = mergeFeedback(feedbackArray);

    feedback.citation = citationData
      ? `"${citationData.title}". ${citationData.source}, ${citationData.accessDate}, ${citationData.url}.`
      : "";

    res.json({ feedback });
  } catch (err) {
    logger.error("Error analyzing essay:", err);
    res
      .status(500)
      .json({ message: "Failed to analyze essay. Please try again later." });
  }
});

module.exports = router;


