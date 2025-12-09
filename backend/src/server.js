const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
const Bonjour = require('bonjour-service').Bonjour;
require('dotenv').config();

const apiRoutes = require('./routes/api');
const DatabaseService = require('./services/database');
const MusicBrainzService = require('./services/musicbrainz');
const LastFmService = require('./services/lastfm');
const ScrobbleManager = require('./services/scrobbleManager');

const app = express();

// Initialize services
const db = new DatabaseService();
const musicbrainz = new MusicBrainzService();

// Initialize Last.fm service (optional - only if credentials configured)
let lastfm = null;
let scrobbleManager = null;

if (process.env.LASTFM_API_KEY && process.env.LASTFM_API_SECRET) {
  // Load session key from database (persists across restarts)
  const savedSessionKey = db.getSetting('lastfm_session_key');
  const savedUsername = db.getSetting('lastfm_username');

  lastfm = new LastFmService(
    process.env.LASTFM_API_KEY,
    process.env.LASTFM_API_SECRET,
    savedSessionKey
  );

  scrobbleManager = new ScrobbleManager(lastfm, db);
  db.setScrobbleManager(scrobbleManager);

  if (lastfm.isAuthenticated()) {
    console.log(`[Last.fm] Service initialized (authenticated as ${savedUsername || 'unknown'})`);
  } else {
    console.log('[Last.fm] Service initialized (not authenticated - visit /api/lastfm/auth)');
  }
} else {
  console.log('[Last.fm] Not configured (set LASTFM_API_KEY and LASTFM_API_SECRET in .env)');
}
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// mDNS service advertisement
const bonjour = new Bonjour();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (cover art, frontend)
app.use('/covers', express.static(path.join(__dirname, '../public/covers')));
app.use(express.static(path.join(__dirname, '../public')));

// Make services available to routes
app.set('io', io);
app.set('db', db);
app.set('musicbrainz', musicbrainz);
app.set('lastfm', lastfm);

// API routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for any unmatched routes
app.get('*', (req, res, next) => {
  // Skip API routes and static files
  if (req.path.startsWith('/api') || req.path.startsWith('/covers') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
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
  db.cleanupCommands();
}, 60000); // Every minute

// Start server
server.listen(PORT, () => {
  // Advertise via mDNS so ESP32 can find us
  const mdnsService = bonjour.publish({
    name: 'CD Jukebox Backend',
    type: 'cdjukebox',
    port: PORT,
    host: 'cdjukebox.local'
  });

  // Get local IP addresses for display
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(`${iface.address} (${name})`);
      }
    }
  }

  console.log(`
╔═══════════════════════════════════════════╗
║   CD Jukebox Backend Server Running       ║
╚═══════════════════════════════════════════╝

  Port:        ${PORT}
  API:         http://localhost:${PORT}/api
  WebSocket:   ws://localhost:${PORT}
  Health:      http://localhost:${PORT}/health

  mDNS:        cdjukebox.local:${PORT}
  Service:     _cdjukebox._tcp

  Local IPs:
${addresses.map(a => `    - ${a}`).join('\n')}

  Endpoints:
  - GET    /api/discs
  - GET    /api/discs/:player/:position
  - POST   /api/discs/:player/:position
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
  - POST   /api/enrich/:player/:position
  - GET    /api/stats
  - GET    /api/lastfm/status
  - GET    /api/lastfm/auth
  - GET    /api/lastfm/callback
  - POST   /api/lastfm/disconnect

  ESP32 can discover this server via:
    - mDNS service: _cdjukebox._tcp
    - mDNS hostname: cdjukebox.local

╔═══════════════════════════════════════════╗
║            Server is ready!               ║
╚═══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received, closing server...`);
  bonjour.unpublishAll();
  bonjour.destroy();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server, io };
