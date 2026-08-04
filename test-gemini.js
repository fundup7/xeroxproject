require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in .env!');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const candidateModels = [
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002',
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro'
  ];

  console.log('🔍 Testing Gemini Model Names with your API key...\n');
  const workingModels = [];

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Hi');
      const responseText = result.response.text();
      console.log(`✅ [WORKING] Model: "${modelName}" -> Response: "${responseText.trim()}"`);
      workingModels.push(modelName);
    } catch (err) {
      console.log(`❌ [FAILED]  Model: "${modelName}" -> ${err.message.split('\n')[0]}`);
    }
  }

  console.log('\n=============================================');
  console.log('VERIFIED WORKING MODELS:', workingModels);
  console.log('=============================================\n');
}

testModels();
