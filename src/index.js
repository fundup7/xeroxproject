require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  downloadContentFromMessage,
  getContentType
} = require('@whiskeysockets/baileys');

const { useMongoAuthState } = require('./auth');
const { analyzePDF } = require('./gemini');

// Global state variables
let sock = null;
let connectionState = 'DISCONNECTED';
let qrCodeValue = null;
const processedMessageIds = new Set();

// Maximum memory protection limit for in-memory deduplication (500 items max)
const MAX_DEDUPE_CACHE = 500;

// Express Keep-Alive & Health Server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; padding: 20px; text-align: center;">
      <h2>🤖 Headless WhatsApp PDF Relay Bot</h2>
      <p>Status: <strong>${connectionState}</strong></p>
      <p>Target Group: <code>${process.env.TARGET_GROUP_JID || 'Not Configured (Check Logs)'}</code></p>
      <p>Print Shop: <code>${process.env.PRINT_SHOP_JID || 'Not Configured'}</code></p>
    </div>
  `);
});

app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    whatsapp: connectionState,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`[HTTP Server] Listening on port ${PORT} (Keep-alive route: /ping)`);
});

/**
 * Format phone number string into WhatsApp canonical JID
 */
function formatJID(rawJid) {
  if (!rawJid) return null;
  const cleaned = rawJid.trim();
  if (cleaned.endsWith('@s.whatsapp.net') || cleaned.endsWith('@g.us')) {
    return cleaned;
  }
  const digitsOnly = cleaned.replace(/\D/g, '');
  return `${digitsOnly}@s.whatsapp.net`;
}

/**
 * Main Baileys WhatsApp Connection Initializer
 */
async function startBot() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri || mongoUri.includes('username:password')) {
    console.error('[ERROR] Valid MONGO_URI is missing in .env file!');
    console.error('Please configure MONGO_URI before starting.');
    process.exit(1);
  }

  // Connect to MongoDB
  if (mongoose.connection.readyState === 0) {
    try {
      console.log('[MongoDB] Connecting to database...');
      await mongoose.connect(mongoUri);
      console.log('[MongoDB] Connected successfully.');
    } catch (err) {
      console.error('[MongoDB] Connection failure:', err.message);
      setTimeout(startBot, 10000);
      return;
    }
  }

  // Load custom Mongo Auth State
  const { state, saveCreds, clearState } = await useMongoAuthState();

  // Create Baileys Socket
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    syncFullHistory: false
  });

  // Save auth state on credentials update
  sock.ev.on('creds.update', saveCreds);

  // Connection Update Listener
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeValue = qr;
      connectionState = 'AWAITING_QR_SCAN';
      console.log('\n======================================================');
      console.log('📱 SCAN THIS QR CODE WITH YOUR WHATSAPP PHONE APP');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n======================================================\n');
    }

    if (connection === 'open') {
      connectionState = 'CONNECTED';
      qrCodeValue = null;
      console.log('\n✅ [WhatsApp Bot] Successfully connected & operational!');

      // Fetch and list participating groups to help user locate TARGET_GROUP_JID
      try {
        console.log('\n=== YOUR WHATSAPP GROUPS (Find your college group JID below) ===');
        const groups = await sock.groupFetchAllParticipating();
        for (const [jid, group] of Object.entries(groups)) {
          console.log(`📌 Group Name: "${group.subject}"`);
          console.log(`   Group JID:  ${jid}\n`);
        }
        console.log('=================================================================\n');
      } catch (gErr) {
        console.warn('[WhatsApp Bot] Could not list groups:', gErr.message);
      }
    }

    if (connection === 'close') {
      connectionState = 'DISCONNECTED';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.warn(`[WhatsApp Bot] Connection closed. Status Code: ${statusCode}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.error('❌ [WhatsApp Bot] Logged out from WhatsApp. Clearing session...');
        await clearState();
        setTimeout(startBot, 5000);
      } else {
        console.log('🔄 [WhatsApp Bot] Reconnecting in 5 seconds...');
        setTimeout(startBot, 5000);
      }
    }
  });

  // Real-time Incoming Message Listener
  sock.ev.on('messages.upsert', async (m) => {
    try {
      if (m.type !== 'notify') return; // Ignore historical background syncs

      for (const msg of m.messages) {
        const messageId = msg.key.id;
        const remoteJid = msg.key.remoteJid;
        const messageTimestamp = msg.messageTimestamp;
        const printShopJid = formatJID(process.env.PRINT_SHOP_JID);

        // Skip messages sent to/from the print shop directly to prevent loops
        if (remoteJid === printShopJid) continue;

        // Target Group Filter
        const targetGroupJid = process.env.TARGET_GROUP_JID?.trim();
        if (targetGroupJid && remoteJid !== targetGroupJid) {
          continue;
        }

        // Message Age Guard: Ignore messages older than 120 seconds
        const currentUnix = Math.floor(Date.now() / 1000);
        if (currentUnix - messageTimestamp > 120) continue;

        // Deduplication Guard: Ignore already processed messages
        if (processedMessageIds.has(messageId)) continue;

        // Detect document message structure
        const contentType = getContentType(msg.message);
        if (!contentType) continue;

        let docMsg = null;
        let caption = '';

        if (contentType === 'documentMessage') {
          docMsg = msg.message.documentMessage;
          caption = docMsg.caption || '';
        } else if (contentType === 'documentWithCaptionMessage') {
          docMsg = msg.message.documentWithCaptionMessage?.message?.documentMessage;
          caption = docMsg?.caption || '';
        }

        // Proceed only if a PDF document is detected
        if (!docMsg || (docMsg.mimetype !== 'application/pdf' && !docMsg.fileName?.toLowerCase().endsWith('.pdf'))) {
          continue;
        }

        const fileName = docMsg.fileName || 'document.pdf';

        // Mark as processed early to prevent double-execution
        processedMessageIds.add(messageId);
        if (processedMessageIds.size > MAX_DEDUPE_CACHE) {
          const firstItem = processedMessageIds.values().next().value;
          processedMessageIds.delete(firstItem);
        }

        console.log(`\n📄 [PDF Detected] Group: ${remoteJid} | File: "${fileName}"`);

        // Download PDF safely into memory with size ceiling
        let pdfBuffer = Buffer.alloc(0);
        const stream = await downloadContentFromMessage(docMsg, 'document');

        for await (const chunk of stream) {
          pdfBuffer = Buffer.concat([pdfBuffer, chunk]);
          if (pdfBuffer.length > 20 * 1024 * 1024) { // 20 MB RAM Limit Guard
            console.warn(`[Limit] PDF "${fileName}" exceeds 20MB size cap. Skipping.`);
            return;
          }
        }

        console.log(`[Download] Downloaded "${fileName}" (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB) to memory.`);

        // Analyze document intent using Gemini AI
        const aiResult = await analyzePDF(pdfBuffer, caption, fileName);

        if (!aiResult.shouldPrint) {
          console.log(`⏩ [Skipped] "${fileName}" classified as non-printable: ${aiResult.reason}`);
          continue;
        }

        // Print Shop Target Validation
        if (!printShopJid) {
          console.error('[ERROR] PRINT_SHOP_JID is not configured in .env!');
          continue;
        }

        // Add 3-7 second human-like delay jitter before sending
        const delayMs = Math.floor(Math.random() * 4000) + 3000;
        console.log(`⏳ Waiting ${(delayMs / 1000).toFixed(1)}s delay before forwarding to Print Shop (${printShopJid})...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Forward PDF Buffer directly to Print Shop JID
        const sendCaption = aiResult.recommendedCaption || `Please print 1 copy of ${fileName}. I will pick it up at 3:30 PM.`;

        await sock.sendMessage(printShopJid, {
          document: pdfBuffer,
          mimetype: 'application/pdf',
          fileName: fileName,
          caption: sendCaption
        });

        console.log(`🚀 [SUCCESS] Forwarded "${fileName}" to Print Shop (${printShopJid})!`);
        console.log(`   Caption Sent: "${sendCaption}"\n`);
      }
    } catch (err) {
      console.error('[Message Processing Error]:', err.message);
    }
  });
}

// Start application
startBot();
