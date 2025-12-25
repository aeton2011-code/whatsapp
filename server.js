/* 
  REAL WHATSAPP BACKEND SERVER
  
  To run this locally:
  1. mkdir saudibot-backend && cd saudibot-backend
  2. npm init -y
  3. npm install whatsapp-web.js socket.io express cors
  4. Save this file as server.js
  5. Run: node server.js
*/

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from the frontend
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

console.log('Initializing WhatsApp Client...');

// Initialize WhatsApp Client with LocalAuth to save session
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    // Arguments needed for most cloud environments (Heroku, Render, etc.)
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote'
    ]
  }
});

let qrCodeData = null;
let isClientReady = false;

client.on('qr', (qr) => {
  console.log('QR RECEIVED (First 20 chars):', qr.substring(0, 20) + '...');
  qrCodeData = qr;
  io.emit('qr_code', qr);
});

client.on('ready', () => {
  console.log('Client is ready!');
  isClientReady = true;
  qrCodeData = null;
  io.emit('status', 'CONNECTED');
});

client.on('authenticated', () => {
  console.log('AUTHENTICATED');
  io.emit('status', 'CONNECTING');
});

client.on('message', async (msg) => {
  console.log('MESSAGE RECEIVED:', msg.body);
  
  // Basic info needed for frontend
  const messageData = {
    id: msg.id.id,
    sender: msg.from, // This is the phone number ID
    text: msg.body,
    timestamp: new Date().toISOString(),
    isBot: false,
    isIncoming: true,
    notifyName: msg._data.notifyName || 'Unknown' // Attempt to get display name
  };

  io.emit('new_message', messageData);
});

// Initialize Socket.IO
io.on('connection', (socket) => {
  console.log('Frontend connected:', socket.id);

  // Send current status immediately
  if (isClientReady) {
    socket.emit('status', 'CONNECTED');
  } else if (qrCodeData) {
    socket.emit('qr_code', qrCodeData);
  } else {
    socket.emit('status', 'SCAN_QR');
  }

  // Handle outgoing messages from frontend
  socket.on('send_message', async (data) => {
    try {
      const { to, text } = data;
      // 'to' should be the chat ID (e.g., 966500000000@c.us)
      await client.sendMessage(to, text);
      console.log(`Sent message to ${to}: ${text}`);
      
      // Echo back to frontend so it shows in chat
      socket.emit('message_sent', {
        id: Date.now().toString(),
        sender: 'SaudiBot',
        text: text,
        timestamp: new Date().toISOString(),
        isBot: true,
        isIncoming: false,
        to: to
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Frontend disconnected');
  });
});

client.initialize();

// Listen on 0.0.0.0 to accept connections from all interfaces
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
