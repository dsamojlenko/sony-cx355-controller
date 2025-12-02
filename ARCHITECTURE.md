# System Architecture - Sony CX355 Jukebox

## Overview
Three-tier system: ESP32 ↔ Backend (Pi) ↔ Web UI (Multiple Devices)

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        WEB CLIENTS                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Pi Display │  │    Laptop    │  │    Phone     │     │
│  │   (Kiosk)    │  │   Browser    │  │   Browser    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│                     HTTP + WebSocket                         │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             │
┌────────────────────────────▼─────────────────────────────────┐
│                   BACKEND SERVER (Pi)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Web Server (Express)                                  │ │
│  │  - Serves static UI files                             │ │
│  │  - REST API endpoints                                 │ │
│  │  - WebSocket server (Socket.io)                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Business Logic                                        │ │
│  │  - State management                                    │ │
│  │  - Command queuing/forwarding                         │ │
│  │  - MusicBrainz API client                             │ │
│  │  - Cover art downloader/cache                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  SQLite Database                                       │ │
│  │  - discs (300 entries)                                │ │
│  │  - tracks                                             │ │
│  │  - playback_state                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  File System                                           │ │
│  │  - /covers/*.jpg (cached album art)                   │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                    HTTP POST/GET
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                    ESP32 DEVICE                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  WiFi Client                                           │ │
│  │  - Connects to local network                          │ │
│  │  - mDNS discovery (finds Pi automatically)            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  HTTP Client                                           │ │
│  │  - POST state updates to Pi                           │ │
│  │  - Poll for commands (or WebSocket)                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  S-Link Interface (Existing)                          │ │
│  │  - RX: Decode incoming status frames                  │ │
│  │  - TX: Send control commands                          │ │
│  │  - State tracking                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Optional: Physical Controls                          │ │
│  │  - Buttons/keypad                                     │ │
│  │  - Direct command triggering                          │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                     S-Link Protocol
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                  Sony CDP-CX355                              │
│                  300-Disc CD Changer                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Flow 1: Status Update (CD Playing)
```
CD Player                ESP32              Backend (Pi)        Web UI
    │                      │                      │                │
    │──S-Link Status──────▶│                      │                │
    │  (Disc 42, Trk 5)    │                      │                │
    │                      │                      │                │
    │                      │──HTTP POST──────────▶│                │
    │                      │  /api/state          │                │
    │                      │  {disc:42,track:5}   │                │
    │                      │                      │                │
    │                      │                      │──DB Update────▶│
    │                      │                      │                │
    │                      │                      │──WebSocket────▶│
    │                      │◀──HTTP 200 OK───────│  (broadcast)   │
    │                      │                      │                │
    │                      │                      │                │──UI Update──▶
    │                      │                      │                │  (Album Art)
    │                      │                      │                │  (Track List)
```

### Flow 2: User Selects Album to Play (Jukebox)
```
Web UI                Backend (Pi)           ESP32            CD Player
   │                      │                      │                │
   │──User Clicks─────▶   │                      │                │
   │  "Play Disc 73"      │                      │                │
   │                      │                      │                │
   │──HTTP POST──────────▶│                      │                │
   │  /api/control/play   │                      │                │
   │  {disc:73}           │                      │                │
   │                      │                      │                │
   │                      │──Queue Command──────▶│                │
   │                      │  HTTP GET/POST       │                │
   │◀──HTTP 200 OK───────│  {action:"play",     │                │
   │  {status:"queued"}   │   disc:73}           │                │
   │                      │                      │                │
   │                      │                      │──S-Link TX────▶│
   │                      │                      │  Play Disc 73  │
   │                      │                      │                │
   │                      │                      │◀──S-Link RX────│
   │                      │◀──Status Update─────│  (Confirmation)│
   │                      │  (Disc 73 playing)   │                │
   │                      │                      │                │
   │◀──WebSocket─────────│                      │                │
   │  State update        │                      │                │
   │                      │                      │                │
   │──UI Update──────▶    │                      │                │
   │  (Show Disc 73)      │                      │                │
```

### Flow 3: Metadata Enrichment
```
Backend (Pi)           MusicBrainz API      Cover Art Archive
     │                      │                      │
     │──On First Play──▶    │                      │
     │  Disc 42             │                      │
     │  Artist: "Radiohead" │                      │
     │  Album: "OK Computer"│                      │
     │                      │                      │
     │──HTTP GET───────────▶│                      │
     │  /ws/2/release/      │                      │
     │  ?query=...          │                      │
     │                      │                      │
     │◀──JSON Response─────│                      │
     │  {release_id,        │                      │
     │   tracks:[...],      │                      │
     │   year:1997}         │                      │
     │                      │                      │
     │──Save to DB─────▶    │                      │
     │                      │                      │
     │──HTTP GET───────────────────────────────────▶│
     │  /release/{id}/front │                      │
     │                      │                      │
     │◀──JPEG Image────────────────────────────────│
     │                      │                      │
     │──Save to FS─────▶    │                      │
     │  /covers/42.jpg      │                      │
```

---

## ESP32 ↔ Backend Communication

### Option A: Polling (Simpler)
ESP32 periodically polls backend for commands:

```javascript
// ESP32 loop
void loop() {
  slink.loop();  // Decode S-Link

  // Check for state changes
  if (stateChanged) {
    postStateUpdate();
  }

  // Poll for commands every 500ms
  if (millis() - lastPoll > 500) {
    checkForCommands();
    lastPoll = millis();
  }
}
```

**Backend endpoint:**
- `GET /api/esp32/poll` → returns pending command or `{}`

**Pros:**
- Simple to implement
- ESP32 doesn't need server
- Reliable

**Cons:**
- 500ms latency
- More network traffic

---

### Option B: WebSocket (More Responsive)
ESP32 maintains WebSocket connection to backend:

```javascript
// ESP32
WebSocketsClient webSocket;

void setup() {
  webSocket.begin("192.168.1.100", 3000, "/ws/esp32");
  webSocket.onEvent(webSocketEvent);
}

void loop() {
  webSocket.loop();
  slink.loop();
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_TEXT) {
    // Parse command JSON
    // Execute S-Link TX
  }
}
```

**Pros:**
- Instant command delivery
- Bi-directional
- Less polling overhead

**Cons:**
- More complex ESP32 code
- Connection management needed
- Memory overhead

---

### Recommendation: **Start with Polling, upgrade to WebSocket if needed**

Polling is simpler and 500ms is acceptable for user-initiated commands. WebSocket can be added later if physical buttons require instant feedback.

---

## Database Schema

```sql
CREATE TABLE discs (
  position INTEGER PRIMARY KEY,      -- 1-300
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  musicbrainz_id TEXT,               -- MBID from MusicBrainz
  year INTEGER,
  cover_art_path TEXT,               -- e.g., /covers/42.jpg
  genre TEXT,
  duration_seconds INTEGER,
  track_count INTEGER,
  last_played DATETIME,
  play_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disc_position INTEGER NOT NULL,
  track_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  duration_seconds INTEGER,
  FOREIGN KEY (disc_position) REFERENCES discs(position),
  UNIQUE(disc_position, track_number)
);

CREATE TABLE playback_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- Single row
  current_disc INTEGER,
  current_track INTEGER,
  state TEXT CHECK(state IN ('play', 'pause', 'stop')),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_disc) REFERENCES discs(position)
);

CREATE INDEX idx_discs_artist ON discs(artist);
CREATE INDEX idx_discs_album ON discs(album);
CREATE INDEX idx_discs_last_played ON discs(last_played DESC);
CREATE INDEX idx_tracks_disc ON tracks(disc_position);
```

---

## Backend API Specification

### State Management

**POST /api/state**
- **From:** ESP32
- **Body:** `{disc: 42, track: 5, state: "play"}`
- **Response:** `{success: true}`
- **Side effects:**
  - Update `playback_state` table
  - Increment `play_count` if new disc
  - Update `last_played` timestamp
  - Broadcast via WebSocket to all clients

**GET /api/current**
- **From:** Web UI
- **Response:**
  ```json
  {
    "disc": 42,
    "track": 5,
    "state": "play",
    "metadata": {
      "artist": "Radiohead",
      "album": "OK Computer",
      "year": 1997,
      "coverArt": "/covers/42.jpg",
      "trackTitle": "Paranoid Android"
    }
  }
  ```

---

### Disc Metadata

**GET /api/discs**
- **Query params:**
  - `search` (filter by artist/album)
  - `sort` (artist/album/position/lastPlayed)
  - `limit`, `offset` (pagination)
- **Response:**
  ```json
  {
    "total": 300,
    "discs": [
      {
        "position": 1,
        "artist": "The Strokes",
        "album": "This is it",
        "coverArt": "/covers/1.jpg",
        "year": 2001,
        "trackCount": 11,
        "playCount": 42
      },
      ...
    ]
  }
  ```

**GET /api/discs/:position**
- **Response:**
  ```json
  {
    "position": 42,
    "artist": "Radiohead",
    "album": "OK Computer",
    "year": 1997,
    "coverArt": "/covers/42.jpg",
    "genre": "Alternative Rock",
    "tracks": [
      {"number": 1, "title": "Airbag", "duration": 284},
      {"number": 2, "title": "Paranoid Android", "duration": 383},
      ...
    ],
    "playCount": 15,
    "lastPlayed": "2025-11-30T10:30:00Z"
  }
  ```

**POST /api/discs/:position**
- **From:** Admin UI
- **Body:**
  ```json
  {
    "musicbrainzId": "...",
    "year": 1997,
    "genre": "Alternative Rock"
  }
  ```
- **Side effects:**
  - Fetch full metadata from MusicBrainz
  - Download cover art
  - Save tracks to database

---

### Control Commands

**POST /api/control/play/:disc/:track?**
- **Body:** `{disc: 73, track: 1}` (track optional)
- **Response:** `{success: true, queued: true}`
- **Side effects:**
  - Queue command for ESP32
  - ESP32 polls and receives command
  - ESP32 sends S-Link TX

**POST /api/control/pause**
**POST /api/control/stop**
**POST /api/control/next**
**POST /api/control/previous**

---

### ESP32 Endpoints

**GET /api/esp32/poll**
- **From:** ESP32 (every 500ms)
- **Response:**
  ```json
  {
    "command": "play",
    "disc": 73,
    "track": 1,
    "id": "cmd-123"  // For acknowledgment
  }
  ```
  Or `{}` if no pending commands

**POST /api/esp32/ack**
- **From:** ESP32 (after executing command)
- **Body:** `{id: "cmd-123", success: true}`
- **Response:** `{success: true}`

---

### MusicBrainz Integration

**GET /api/search/musicbrainz?q=artist+album**
- **From:** Admin UI
- **Response:** Proxied MusicBrainz search results

**POST /api/enrich/:position**
- **From:** Admin UI (after searching MusicBrainz)
- **Body:** `{musicbrainzId: "..."}`
- **Side effects:**
  - Fetch metadata
  - Download cover art
  - Save tracks

---

## WebSocket Events

**Client → Server:**
- `subscribe` - Subscribe to real-time updates
- `unsubscribe` - Unsubscribe

**Server → Clients:**
- `state` - Playback state changed
  ```json
  {
    "event": "state",
    "data": {
      "disc": 42,
      "track": 5,
      "state": "play",
      "timestamp": "..."
    }
  }
  ```

- `metadata_updated` - Disc metadata enriched
  ```json
  {
    "event": "metadata_updated",
    "data": {
      "position": 42,
      "artist": "Radiohead",
      "album": "OK Computer"
    }
  }
  ```

---

## Technology Stack Summary

### Backend (Raspberry Pi)
- **Runtime:** Node.js 18+
- **Framework:** Express
- **Database:** better-sqlite3
- **WebSocket:** Socket.io
- **MusicBrainz:** `musicbrainz-api` or `axios`
- **Image Download:** `axios` + `fs`
- **CSV Import:** `csv-parser`

### ESP32 Firmware
- **Framework:** Arduino/PlatformIO
- **WiFi:** WiFiClient (built-in)
- **HTTP Client:** HTTPClient (built-in)
- **Optional WebSocket:** `arduinoWebSockets` library
- **JSON:** ArduinoJson library
- **mDNS:** ESPmDNS (built-in)

### Frontend (Web UI)
- **Option A (React):**
  - Create React App or Vite
  - Socket.io-client
  - Tailwind CSS or Material-UI
  - React Router

- **Option B (Vue):**
  - Vue 3 + Vite
  - Socket.io-client
  - Tailwind CSS or Vuetify
  - Vue Router

- **Option C (Vanilla):**
  - Plain HTML/CSS/JS
  - Native WebSocket
  - CSS Grid/Flexbox

---

## Deployment & Operations

### Backend Setup (Raspberry Pi)
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repo
cd /home/pi
git clone <repo-url> cd-jukebox
cd cd-jukebox/backend

# Install dependencies
npm install

# Import CD data
npm run import -- /path/to/CD_Player_Contents.csv

# Start server (development)
npm start

# Start server (production with PM2)
npm install -g pm2
pm2 start server.js --name cd-jukebox
pm2 save
pm2 startup
```

### Frontend Setup (Kiosk Pi)
```bash
# Install Chromium
sudo apt-get update
sudo apt-get install -y chromium-browser unclutter

# Create autostart script
mkdir -p ~/.config/lxsession/LXDE-pi
nano ~/.config/lxsession/LXDE-pi/autostart

# Add:
@xset s off
@xset -dpms
@xset s noblank
@chromium-browser --kiosk --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble http://localhost:3000

# Reboot
sudo reboot
```

### ESP32 Deployment
```bash
# Update WiFi credentials in secrets.h
# Update backend URL/IP

# Build & upload
pio run -t upload

# Monitor serial
pio device monitor
```

---

## Future Enhancements

1. **Physical Controls**
   - Keypad on ESP32 for direct disc selection
   - Rotary encoder for browsing
   - OLED display for local feedback

2. **Advanced Features**
   - Playlist creation
   - Shuffle mode
   - Repeat mode
   - Queue management

3. **Statistics & Analytics**
   - Most played albums
   - Listening history
   - Genre breakdown
   - Time-of-day patterns

4. **Integrations**
   - Spotify/Apple Music linking
   - Scrobbling to Last.fm
   - Home Assistant integration
   - Voice control (Alexa/Google)

5. **Multi-Room**
   - Sync multiple displays
   - Zone-based playback

---

## Next: Implementation Phases

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for detailed implementation phases and next steps.
