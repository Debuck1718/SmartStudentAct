
const { GoogleGenerativeAI } = require('@google/generative-ai');


const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('GEMINI_API_KEY is not set in the .env file.');
    process.exit(1); 
}


const genAI = new GoogleGenerativeAI(API_KEY);


const generateContent = async (prompt) => {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text(); 
        
        return { text };
    } catch (error) {
        throw new Error(`Failed to generate content: ${error.message}`);
    }
};

module.exports = { generateContent };