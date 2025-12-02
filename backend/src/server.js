const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (cover art, frontend)
app.use('/covers', express.static(path.join(__dirname, '../public/covers')));
app.use(express.static(path.join(__dirname, '../public')));

// Make io available to routes
app.set('io', io);

// API routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);

  socket.on('subscribe', () => {
    console.log(`Client ${socket.id} subscribed to updates`);
    socket.join('updates');
  });

  socket.on('unsubscribe', () => {
    console.log(`Client ${socket.id} unsubscribed from updates`);
    socket.leave('updates');
  });

  socket.on('disconnect', () => {
    console.log(`WebSocket client disconnected: ${socket.id}`);
  });
});

// Periodic cleanup of old commands
setInterval(() => {
  const DatabaseService = require('./services/database');
  const db = new DatabaseService();
  db.cleanupCommands();
  db.close();
}, 60000); // Every minute

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🎵 CD Jukebox Backend Server Running   ║
╚═══════════════════════════════════════════╝

  Port:        ${PORT}
  API:         http://localhost:${PORT}/api
  WebSocket:   ws://localhost:${PORT}
  Health:      http://localhost:${PORT}/health

  Endpoints:
  - GET    /api/discs
  - GET    /api/discs/:position
  - POST   /api/discs/:position
  - GET    /api/current
  - POST   /api/state (ESP32)
  - POST   /api/control/play
  - POST   /api/control/pause
  - POST   /api/control/stop
  - POST   /api/control/next
  - POST   /api/control/previous
  - GET    /api/esp32/poll
  - POST   /api/esp32/ack
  - GET    /api/search/musicbrainz
  - POST   /api/enrich/:position
  - GET    /api/stats

  Next steps:
  1. Run: npm run import
  2. Open: http://localhost:${PORT}

╔═══════════════════════════════════════════╗
║            Server is ready! 🚀            ║
╚═══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
