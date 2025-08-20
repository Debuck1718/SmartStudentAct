// smartstudent-backend/routes/essay.js

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const logger = require('../utils/logger');
// Import the centralized Gemini API client
const geminiClient = require('../utils/geminiClient');

// Import your middlewares
const { authenticateJWT } = require('../middlewares/auth');
const checkSubscription = require('../middlewares/checkSubscription');

/**
 * Joi Validation Schema
 */
const essaySchema = Joi.object({
    essayText: Joi.string().min(50).required() // Require at least 50 characters for a meaningful essay
});

/**
 * @route POST /api/essay/check
 * @desc Sends an essay to the Gemini API for analysis and returns structured feedback.
 * @access Private (Requires JWT and a valid subscription/trial)
 */
router.post('/check', authenticateJWT, checkSubscription, async (req, res) => {
    // Validate the incoming request body
    const { error, value } = essaySchema.validate(req.body);
    if (error) {
        return res.status(400).json({ status: 'Validation Error', message: error.details[0].message });
    }

    try {
        const { essayText } = value;

        // Construct the prompt to instruct the AI
        const prompt = `
            You are a helpful and detailed academic writing tutor. Analyze the following essay and provide constructive feedback on:
            1.  **Grammar & Spelling**: Point out specific errors and suggest corrections.
            2.  **Clarity & Coherence**: Is the writing easy to follow? Do the ideas flow logically?
            3.  **Argument Strength**: Is the thesis clear? Is the argument well-supported by evidence?
            4.  **Tone & Style**: Is the tone appropriate for an academic paper?

            Format your response as a JSON object with keys for 'grammar', 'clarity', 'argument', and 'style'. Each key should contain an array of feedback strings. If a section has no feedback, return an empty array.

            Essay to analyze:
            "${essayText}"
        `;

        // The payload for the Gemini API call
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                // This tells the model to return a JSON object that matches the schema
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "grammar": { "type": "ARRAY", "items": { "type": "STRING" } },
                        "clarity": { "type": "ARRAY", "items": { "type": "STRING" } },
                        "argument": { "type": "ARRAY", "items": { "type": "STRING" } },
                        "style": { "type": "ARRAY", "items": { "type": "STRING" } }
                    },
                }
            }
        };

        // Use the geminiClient to make the API call and get the response
        const result = await geminiClient.generateContent(payload);

        // Parse the JSON string from the API response
        const feedback = JSON.parse(result.text);

        res.json({ feedback });

    } catch (error) {
        logger.error('Error analyzing essay:', error);
        res.status(500).json({ message: 'Failed to analyze essay. Please try again later.' });
    }
});

module.exports = router;