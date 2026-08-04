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
 * Analyzes PDF buffer, caption, uploader sender identity, and surrounding group text context.
 * 
 * @param {Buffer} pdfBuffer - Memory buffer of the full PDF file
 * @param {string} caption - WhatsApp caption sent alongside the PDF message
 * @param {string} fileName - File name of the PDF document
 * @param {string} docSender - Name or identifier of the person who uploaded the PDF
 * @param {Array<{sender: string, text: string, time: string}>} recentContext - Surrounding text messages from group
 * @returns {Promise<{ shouldPrint: boolean, reason: string, documentTitle: string, recommendedCaption: string }>}
 */
async function analyzePDF(pdfBuffer, caption = '', fileName = 'document.pdf', docSender = 'Teacher/Uploader', recentContext = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  const isLbaFileName = /lba|test|question|exam|worksheet|assignment|model_paper/i.test(fileName);

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

  // Format surrounding group chat context with clear sender separation
  let formattedContext = 'No surrounding text messages recorded.';
  if (recentContext && recentContext.length > 0) {
    formattedContext = recentContext.map(m => {
      const isUploader = m.sender === docSender ? '⭐ (PDF Uploader)' : '';
      return `[${m.time}] ${m.sender}${isUploader}: "${m.text}"`;
    }).join('\n');
  }

  const prompt = `
You are an intelligent document classification filter for a 2nd PUC college student.
Your primary objective is to make sure every important LBA / test / study paper gets printed, while filtering out non-essential circulars.

Document Metadata:
- File Name: "${fileName}"
- PDF Uploader: "${docSender}"
- Attached Caption: "${caption}"
- Total Pages: ${pageCount}

Surrounding Group Text Conversation (Before & After PDF upload):
${formattedContext}

CRITICAL RULES FOR DECISION:
1. 🚨 RULE #1 (HIGHEST PRIORITY - LBA PAPERS):
   - If the file name or document content contains "LBA", "Learning Based Assessment", "Test Paper", "Question Paper", "Worksheet", "Model Paper", "Practice Paper", or "Assignment Sheet", set "shouldPrint": true ALWAYS.
   - Never skip any LBA document under any circumstances!

2. 👤 SENDER ATTRIBUTION RULE:
   - Check messages sent specifically by the PDF Uploader ("${docSender}").
   - If "${docSender}" or any teacher sends text saying "print this", "take a printout", "bring 1 copy to class", or "solve this paper", set "shouldPrint": true.
   - If "${docSender}" explicitly sends text saying "do not print", "reference only", or "for online reading", set "shouldPrint": false.

3. 📄 GENERAL CIRCULARS vs STUDY PAPERS:
   - Fee payment notices, general college timetables, meeting announcements, bus routes, or flyers -> "shouldPrint": false (UNLESS the teacher explicitly asks to print it).

Return valid JSON strictly matching this schema:
{
  "shouldPrint": true or false,
  "reason": "Clear 1-sentence reason referencing document type and sender context",
  "documentTitle": "Subject or Name of the document",
  "recommendedCaption": "A polite message for the xerox shop operator requesting 1 print copy for pick up at 3:30 PM"
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

      // Force LBA safety override if filename or title indicates LBA paper
      if (isLbaFileName && !parsed.shouldPrint) {
        console.warn(`[Gemini AI] LBA Safety Override applied for "${fileName}". Forcing shouldPrint = true.`);
        parsed.shouldPrint = true;
        parsed.reason = `LBA Safety Guarantee: "${fileName}" is an essential test paper.`;
      }

      console.log(`[Gemini AI] Model: "${modelName}" | Uploader: "${docSender}" | Document: "${parsed.documentTitle}" | Print: ${parsed.shouldPrint} | Reason: ${parsed.reason}`);
      return parsed;

    } catch (error) {
      console.warn(`[Gemini AI] Model "${modelName}" attempt failed (${error.message.split('\n')[0]}). Trying next verified model...`);
    }
  }

  // Safe Fallback if all AI model calls encounter errors
  console.error('[Gemini AI] All verified AI models failed or rate limited. Triggering safety fallback.');
  return {
    shouldPrint: true,
    reason: 'AI classification model fallback (LBA default print)',
    documentTitle: fileName,
    recommendedCaption: `Please print 1 copy of ${fileName}. I will pick it up at 3:30 PM. Thank you!`
  };
}

module.exports = { analyzePDF, VERIFIED_MODELS };
