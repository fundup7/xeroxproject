const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PDFDocument } = require('pdf-lib');

/**
 * Slices a PDF buffer to include only the first 2 pages for efficient AI analysis.
 * 
 * @param {Buffer} pdfBuffer 
 * @returns {Promise<{ slicedBuffer: Buffer, pageCount: number }>}
 */
async function extractFirstTwoPages(pdfBuffer) {
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pageCount = srcDoc.getPageCount();

    if (pageCount <= 2) {
      return { slicedBuffer: pdfBuffer, pageCount };
    }

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, [0, 1]); // Pages 1 and 2
    copiedPages.forEach((page) => newDoc.addPage(page));

    const slicedPdfBytes = await newDoc.save();
    return { slicedBuffer: Buffer.from(slicedPdfBytes), pageCount };
  } catch (error) {
    console.warn('[PDF Slicer] Warning: Could not slice PDF, analyzing full buffer:', error.message);
    return { slicedBuffer: pdfBuffer, pageCount: 'unknown' };
  }
}

/**
 * Verified Gemini Models (in priority order)
 */
const VERIFIED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash'
];

/**
 * Analyzes the first two pages of a PDF buffer and optional caption using verified Gemini Flash models.
 * 
 * @param {Buffer} pdfBuffer - Memory buffer of the full PDF file
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

  // Extract first 2 pages for analysis
  const { slicedBuffer, pageCount } = await extractFirstTwoPages(pdfBuffer);
  console.log(`[PDF Slicer] Sliced "${fileName}" for Gemini analysis (Pages analyzed: min(2, ${pageCount}) of total ${pageCount})`);

  const genAI = new GoogleGenerativeAI(apiKey);

  const prompt = `
You are an intelligent document classification filter for a 2nd PUC student.
Analyze the attached first 2 pages of this PDF document and the message caption sent with it.

Evaluation Rules:
1. "shouldPrint": true ONLY IF the document is an actionable study paper (LBA test paper, question paper, worksheet, key answer, practice paper, or assignment sheet).
2. "shouldPrint": false IF the document is a general circular, fee payment notice, event flyer, timetable, meeting agenda, syllabus copy, or textbook reference.
3. Check the teacher's caption if available: "${caption}". If the teacher explicitly notes "Do not print" or "For online reading only", set "shouldPrint": false.
4. File Name: "${fileName}"
5. Total Pages in Document: ${pageCount}

Return valid JSON strictly matching this schema:
{
  "shouldPrint": true or false,
  "reason": "Clear 1-sentence reason for your decision",
  "documentTitle": "Name or Subject of the document",
  "recommendedCaption": "A polite message for the xerox shop operator specifying the document name, requesting 1 copy for pick up at 3:30 PM"
}
`;

  const pdfPart = {
    inlineData: {
      data: slicedBuffer.toString('base64'),
      mimeType: 'application/pdf'
    }
  };

  // Try verified models in priority order
  for (const modelName of VERIFIED_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' }
      });

      const result = await model.generateContent([prompt, pdfPart]);
      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      console.log(`[Gemini AI] Verified Model: "${modelName}" | Document: "${parsed.documentTitle}" | Print: ${parsed.shouldPrint} | Reason: ${parsed.reason}`);
      return parsed;

    } catch (error) {
      console.warn(`[Gemini AI] Model "${modelName}" attempt failed (${error.message.split('\n')[0]}). Trying next verified model...`);
    }
  }

  // Safe Fallback if all AI model calls encounter errors
  console.error('[Gemini AI] All verified AI models failed or rate limited. Triggering safety fallback.');
  return {
    shouldPrint: true,
    reason: 'AI classification model fallback',
    documentTitle: fileName,
    recommendedCaption: `Please print 1 copy of ${fileName}. I will pick it up at 3:30 PM. Thank you!`
  };
}

module.exports = { analyzePDF, VERIFIED_MODELS };
