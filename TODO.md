# Headless WhatsApp PDF Relay — Project TODO & Setup Tracker

This document tracks all tasks, required accounts, API keys, and deployment steps for the **Headless WhatsApp PDF Relay** bot.

---

## 👤 1. USER SETUP & PRE-REQUISITES

### [ ] Step 1: Google Gemini API Key (Free)
- [ ] Go to [Google AI Studio](https://aistudio.google.com/)
- [ ] Log in with your Google Account
- [ ] Click **Get API key** -> **Create API key**
- [ ] Copy key into `.env` as `GEMINI_API_KEY`

### [ ] Step 2: MongoDB Atlas Database (Free Cluster)
- [ ] Register at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
- [ ] Create a **Free Shared Cluster (M0)**
- [ ] Under **Database Access**, create a user (Note down username & password)
- [ ] Under **Network Access**, add IP `0.0.0.0/0` (Allows Render cloud access)
- [ ] Click **Connect** -> **Drivers** -> Copy connection string
- [ ] Format connection string and paste into `.env` as `MONGO_URI`
  * *Format example:* `mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/whatsapp_bot?retryWrites=true&w=majority`

### [ ] Step 3: Print Shop WhatsApp Number (Formatted JID)
- [ ] Get the print shop's phone number with international country code (e.g., India: `919876543210`)
- [ ] Format as WhatsApp JID: `919876543210@s.whatsapp.net`
- [ ] Paste into `.env` as `PRINT_SHOP_JID`

### [ ] Step 4: Free Cloud Hosting Accounts
- [ ] Sign up for [Render.com](https://render.com/) (Web Service host)
- [ ] Sign up for [UptimeRobot.com](https://uptimerobot.com/) (10-min keep-alive pinger)

---

## 🤖 2. CODEBASE ARCHITECTURE (AI ASSISTANT TASKS)

- [ ] Create `package.json` with required dependencies (`@whiskeysockets/baileys`, `@google/genai`, `mongoose`, `express`, `dotenv`, `qrcode-terminal`)
- [ ] Create `src/auth.js` — Custom MongoDB AuthState adapter for Baileys session keys using `BufferJSON`
- [ ] Create `src/gemini.js` — Gemini 1.5 Flash AI classifier for PDF validation and xerox shop caption generator
- [ ] Create `src/index.js` — Baileys connection listener, `messages.upsert` filter, PDF downloader, auto-reconnects, and Express `/ping` keep-alive server
- [ ] Create `.env.example` — Template for environment variables

---

## 🚀 3. INITIAL LINKING & DEPLOYMENT STEPS

### Local First-Time Auth
- [ ] Install dependencies: `npm install`
- [ ] Populate `.env` file with your credentials
- [ ] Run bot locally: `npm start`
- [ ] Scan terminal QR code with your WhatsApp app
- [ ] Observe startup console log for list of your WhatsApp Groups and copy your **College Group JID** (`xxxxxx@g.us`)
- [ ] Add `TARGET_GROUP_JID` to `.env`

### Cloud Deployment (Render)
- [ ] Push codebase to private GitHub repository
- [ ] Create a new **Web Service** on Render
- [ ] Set Build Command: `npm install`
- [ ] Set Start Command: `node --max-old-space-size=400 src/index.js`
- [ ] Add Environment Variables in Render Dashboard (`MONGO_URI`, `GEMINI_API_KEY`, `PRINT_SHOP_JID`, `TARGET_GROUP_JID`)
- [ ] Deploy Web Service and verify `Bot Status: CONNECTED` in Render logs

### Keep-Alive Setup (UptimeRobot)
- [ ] Copy your Render service URL (e.g. `https://whatsapp-relay.onrender.com`)
- [ ] Add new HTTP Monitor in UptimeRobot targeting `https://whatsapp-relay.onrender.com/ping`
- [ ] Set monitoring interval to **10 minutes**

---

## 🧪 4. TESTING & VERIFICATION CHECKLIST

- [ ] **Test Case 1 (LBA Test Paper PDF):** Drop an LBA question paper PDF into the target group -> Verify Gemini approves and forwards to Print Shop JID with custom note.
- [ ] **Test Case 2 (Notice/Circular PDF):** Drop a college fee circular or timetable PDF -> Verify Gemini marks `shouldPrint: false` and skips forwarding.
- [ ] **Test Case 3 (Deduplication Test):** Restart Render instance -> Verify bot does not re-forward previously processed PDFs upon reconnect.
- [ ] **Test Case 4 (Keep-Alive Test):** Verify `/ping` route responds with HTTP 200 `{"status": "ONLINE", "whatsapp": "CONNECTED"}`.
