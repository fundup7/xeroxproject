# 🤖 Headless WhatsApp PDF Relay Bot

A low-RAM, cloud-hosted Node.js WhatsApp relay bot built with **@whiskeysockets/baileys**, **MongoDB Atlas**, **Google Gemini 1.5 Flash**, and **Express**.

Designed specifically for 2nd PUC / college students to automatically listen to college WhatsApp groups, filter test papers/assignments using AI, and forward PDFs directly to a local Xerox print shop.

---

## 🌟 Key Features

- **Zero-RAM Ephemeral Session Persistence:** Custom MongoDB adapter uses `BufferJSON` serialization to store multi-device authentication keys in MongoDB Atlas, preventing session logouts when Render spins down or restarts.
- **Smart Gemini AI PDF Classifier:** Uses Google Gemini 1.5 Flash to automatically ignore general circulars, timetables, fee notices, or textbooks, and ONLY print test papers, worksheets, and assignment sheets.
- **Dynamic Print Shop Note:** Generates dynamic, friendly messages for the xerox shop operator specifying the file title and requested pickup time (3:30 PM).
- **Anti-Ban Safeguards:** Human-like random delay jitter (3–7 seconds) between downloads and forwarding actions.
- **Memory & Deduplication Guards:** Hard 20MB file download limit and in-memory message ID caching prevent OOM crashes on Render's 512MB RAM free tier.
- **Keep-Alive Server:** Built-in Express server exposes `/ping` endpoint to work with UptimeRobot (10-minute interval).

---

## 📁 Directory Structure

```
PDF-sender/
├── src/
│   ├── index.js      # Main WhatsApp listener & Express keep-alive server
│   ├── auth.js       # Custom MongoDB AuthState adapter for Baileys
│   └── gemini.js     # Gemini 1.5 Flash PDF classifier & caption builder
├── .env.example      # Environment variables template
├── package.json      # Dependencies and start script (--max-old-space-size=400)
├── TODO.md           # Setup checklist and verification guide
└── README.md         # Deployment instructions & documentation
```

---

## 🛠️ Local Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in the credentials in `.env`:
- `MONGO_URI`: Your MongoDB Atlas connection string.
- `GEMINI_API_KEY`: Your Google AI Studio API key.
- `PRINT_SHOP_JID`: The print shop's phone number (e.g. `919876543210@s.whatsapp.net`).
- `TARGET_GROUP_JID`: Leave empty on first startup!

### 3. First-Time QR Code Scan
Run the application locally:
```bash
npm start
```
1. Scan the terminal QR code using your phone's WhatsApp (`Linked Devices` -> `Link a Device`).
2. Once connected, look at the terminal output. The bot will print a list of all your WhatsApp Groups along with their exact **Group JIDs** (`xxxxxx@g.us`).
3. Copy your College Group JID and paste it into `.env` as `TARGET_GROUP_JID`.

---

## 🚀 Render Cloud Deployment Guide

1. **Push to GitHub:** Create a private GitHub repository and push your project code.
2. **Create Render Web Service:**
   - Log into [Render.com](https://render.com/).
   - Click **New** -> **Web Service** and select your repository.
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node --max-old-space-size=400 src/index.js`
3. **Set Environment Variables in Render:**
   - Add `MONGO_URI`
   - Add `GEMINI_API_KEY`
   - Add `TARGET_GROUP_JID`
   - Add `PRINT_SHOP_JID`
4. **Deploy:** Click **Deploy Web Service**.

---

## ⏱️ Keep-Alive Setup (UptimeRobot)

1. Sign up for a free account at [UptimeRobot.com](https://uptimerobot.com/).
2. Create a new **HTTP(s) Monitor**.
3. **URL:** `https://your-render-app-name.onrender.com/ping`
4. **Monitoring Interval:** `10 minutes`

---

## 🛡️ License & Disclaimers

This software is for personal educational automation. Please respect WhatsApp's Terms of Service and keep automated message volume low.
