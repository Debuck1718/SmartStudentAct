// smartstudent-backend/utils/geminiClient.js

// Import the Gemini API library
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Access the API key from environment variables
const API_KEY = process.env.GEMINI_API_KEY;

// Check if the API key is loaded
if (!API_KEY) {
    console.error('GEMINI_API_KEY is not set in the .env file.');
    process.exit(1); // Exit if the key is missing
}

// Initialize the GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(API_KEY);

// Define a function to generate content
const generateContent = async (prompt) => {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        // Assuming you need to parse a JSON response from the text
        const text = response.text(); 
        
        return { text };
    } catch (error) {
        throw new Error(`Failed to generate content: ${error.message}`);
    }
};

module.exports = { generateContent };