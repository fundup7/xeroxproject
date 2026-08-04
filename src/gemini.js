const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Analyzes a PDF buffer and optional caption to classify document intent and build xerox shop note.
 * 
 * @param {Buffer} pdfBuffer - Memory buffer of the PDF file
 * @param {string} caption - WhatsApp caption sent alongside the message
 * @param {string} fileName - File name of the PDF document
 * @returns {Promise<{ shouldPrint: boolean, reason: string, documentTitle: string, recommendedCaption: string }>}
 */
async function analyzePDF(pdfBuffer, caption = '', fileName = 'document.pdf') {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.includes('YourGeminiAPIKeyHere')) {
    console.warn('[Gemini AI] ⚠️ GEMINI_API_KEY not set or default placeholder used. Operating in FALLBACK mode.');
    return {
      shouldPrint: true,
      reason: 'Gemini AI fallback mode (no API key configured)',
      documentTitle: fileName,
      recommendedCaption: `Please print 1 copy of this document (${fileName}). I will pick it up at 3:30 PM. Thank you!`
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const prompt = `
You are an intelligent document classification filter for a 2nd PUC student.
Your goal is to decide whether a PDF document received in a college WhatsApp group should be automatically forwarded to a local xerox print shop.

Evaluation Rules:
1. "shouldPrint": true ONLY IF the document is an actionable study paper (LBA test paper, question paper, worksheet, key answer, practice paper, or assignment sheet).
2. "shouldPrint": false IF the document is a general circular, fee payment notice, event flyer, timetable, meeting agenda, syllabus copy, or textbook reference.
3. Check the teacher's caption if available: "${caption}". If the teacher explicitly notes "Do not print" or "For online reading only", set "shouldPrint": false.
4. File Name: "${fileName}"

Return valid JSON strictly matching this schema:
{
  "shouldPrint": true or false,
  "reason": "Clear 1-sentence reason for your decision",
  "documentTitle": "Name or Subject of the document",
  "recommendedCaption": "A polite message for the xerox shop operator specifying the document name and requesting 1 copy for pick up at 3:30 PM"
}
`;

    const pdfPart = {
      inlineData: {
        data: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf'
      }
    };

    const result = await model.generateContent([prompt, pdfPart]);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    console.log(`[Gemini AI] Document: "${parsed.documentTitle}" | Print: ${parsed.shouldPrint} | Reason: ${parsed.reason}`);
    return parsed;

  } catch (error) {
    console.error('[Gemini AI] Error during PDF analysis:', error.message);
    // Safe Fallback: If AI call encounters an error, permit printing so student doesn't miss test papers
    return {
      shouldPrint: true,
      reason: `AI classification error fallback (${error.message})`,
      documentTitle: fileName,
      recommendedCaption: `Please print 1 copy of ${fileName}. I will pick it up at 3:30 PM. Thank you!`
    };
  }
}

module.exports = { analyzePDF };
