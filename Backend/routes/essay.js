const express = require('express');
const router = express.Router();
const Joi = require('joi');
const logger = require('../utils/logger');
const geminiClient = require('../utils/geminiClient');

const { authenticateJWT } = require('../middlewares/auth');
const checkSubscription = require('../middlewares/checkSubscription');


const essaySchema = Joi.object({
    essayText: Joi.string().min(50).required() 
});

router.post('/check', authenticateJWT, checkSubscription, async (req, res) => {

    const { error, value } = essaySchema.validate(req.body);
    if (error) {
        return res.status(400).json({ status: 'Validation Error', message: error.details[0].message });
    }

    try {
        const { essayText } = value;

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

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
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

        const result = await geminiClient.generateContent(payload);

        const feedback = JSON.parse(result.text);

        res.json({ feedback });

    } catch (error) {
        logger.error('Error analyzing essay:', error);
        res.status(500).json({ message: 'Failed to analyze essay. Please try again later.' });
    }
});

module.exports = router;