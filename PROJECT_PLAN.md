# Sony CX355 Display System - Project Plan

## Vision
Create a real-time display showing album art, track listings, and current playback status for the Sony CDP-CX355 300-disc CD changer.

---

## Proposed Architecture

### Three-Tier System

```
┌─────────────────┐
│   CD Players    │
│   (S-Link)      │
└────────┬────────┘
         │
         │ S-Link Protocol
         │
┌────────▼────────┐
│  ESP32 Device   │──────┐
│  - S-Link I/F   │      │ WiFi/HTTP
│  - State Mgmt   │      │
│  - API Client   │      │
└─────────────────┘      │
                         │
                    ┌────▼────────────┐
                    │  Backend Server │
                    │  (Raspberry Pi) │
                    │  - REST API     │
                    │  - Database     │
                    │  - MusicBrainz  │
                    └────┬────────────┘
                         │
                         │ HTTP/WebSocket
                         │
                    ┌────▼────────────┐
                    │  Display UI     │
                    │  (Browser)      │
                    │  - Album Art    │
                    │  - Track List   │
                    │  - Now Playing  │
                    └─────────────────┘
```

---

## Component Breakdown

### 1. ESP32 Firmware (Already Started)
**Responsibilities:**
- Decode S-Link frames (✓ mostly done)
- Track current disc/track state
- Publish state changes to backend via HTTP POST
- Handle WiFi connectivity and reconnection
- Optionally cache last-known state in NVS

**Why ESP32 can't do everything:**
- Limited memory (520KB SRAM)
- MusicBrainz API requires TLS/HTTPS (possible but memory-intensive)
- Better to keep ESP32 focused on real-time S-Link decoding
- Album art/metadata caching would fill flash quickly

**Additions needed:**
- WiFi client code
- HTTP client for posting state updates
- Simple REST endpoint calls to backend

---

### 2. Backend Server (Raspberry Pi)
**Responsibilities:**
- Receive state updates from ESP32
- Manage CD database (disc position → CD metadata)
- Query MusicBrainz API on-demand
- Cache album metadata and artwork locally
- Serve REST API for display UI
- WebSocket server for real-time updates to UI

**Technology Stack Options:**
- **Option A: Node.js/Express**
  - Fast to develop
  - Good MusicBrainz libraries available
  - WebSocket support via Socket.io

- **Option B: Python/Flask**
  - Clean REST API with Flask
  - Good for data processing
  - WebSocket via Flask-SocketIO

- **Option C: Go**
  - Lightweight, fast
  - Single binary deployment
  - Built-in HTTP server

**Database:**
- SQLite (simple, file-based, perfect for this scale)
- Schema:
  ```
  discs:
    - position (1-300)
    - disc_id (MusicBrainz)
    - artist
    - album
    - year
    - cover_art_url (local path)
    - last_played

  tracks:
    - disc_position
    - track_number
    - title
    - duration

  playback_state:
    - current_disc
    - current_track
    - state (play/pause/stop)
    - timestamp
  ```

---

### 3. Display UI
**Recommended: Web-based UI on Desktop Monitor**

**Why web-based:**
- Runs on any device with a browser
- Can view from desktop, phone, tablet, or Pi with HDMI
- Easier to iterate and design
- No hardware dependencies

**Display Setup: Dedicated Raspberry Pi + Multi-Device** ✓

**Primary Display (Monitor):**
- Raspberry Pi 3/4 connected via HDMI
- Chromium in kiosk mode (fullscreen, auto-start)
- URL: `http://localhost:3000` (or Pi's IP)
- Always-on "Now Playing" view

**Secondary Access (Phone/Laptop/Tablet):**
- Any device on network can browse to Pi's IP
- Mobile-responsive design
- Full jukebox browsing and control

**UI Modes:**

**1. Now Playing View (Primary Display)**
- Large album artwork (fills most of screen)
- Album title, artist, year
- Complete track listing with current track highlighted
- Transport state indicator (▶️ ⏸️ ⏹️)
- Disc position indicator (e.g., "Disc 47 of 300")
- Transport controls (play/pause/stop/next/prev)
- Recently played carousel

**2. Browse/Jukebox View (Switchable)**
- Grid or list view of all 300 discs
- Album art thumbnails
- Search bar (filter as you type)
- Sort options (artist, album, position, recently played)
- Click album to see details + play button
- Alphabet quick-jump (A-Z)

**3. Mobile View**
- Compact now-playing widget
- Swipeable track list
- Bottom-sheet controls
- Search-first interface for browsing

**Technology:**
- React or Vue.js for reactive UI
- WebSocket connection for instant updates
- Responsive design (works on any screen size)

---

## Data Flow Examples

### Scenario 1: User Presses Play
1. Sony remote sends S-Link command
2. CD player updates S-Link status frames
3. ESP32 decodes frame: `Disc=47, Track=3, State=PLAY`
4. ESP32 HTTP POST to Pi: `{"disc": 47, "track": 3, "state": "play"}`
5. Pi backend:
   - Looks up disc 47 in database
   - If not found, queries MusicBrainz API (or marks for later enrichment)
   - Updates playback state
   - Broadcasts via WebSocket to UI
6. UI updates in real-time:
   - Shows album art
   - Highlights track 3 in the track list
   - Shows "Now Playing"

### Scenario 2: New CD Added to Position 120
- **Manual Method:** Admin UI on Pi to add/edit disc metadata
- **Automatic Method:** When disc 120 first plays, backend detects unknown disc and initiates MusicBrainz lookup
- Lookup requires CD identifier (barcode, disc ID, or artist/album search)

---

## MusicBrainz Integration Strategy

### Approach: Dynamic Lookup with Caching (Recommended)

**Why:**
- CD collection may change over time
- One-time scrape requires knowing all 300 CDs upfront
- Dynamic approach builds database organically as CDs are played
- Manual override always available

**Workflow:**
1. ESP32 reports disc position (e.g., disc 47)
2. Backend checks database for disc 47
3. **If found:** Return cached metadata
4. **If not found:**
   - Mark disc as "unknown" in UI
   - Log disc position for manual identification
   - Optionally: attempt automatic lookup if CD barcode/ISRC available
5. **Manual enrichment:**
   - Admin navigates to backend UI
   - Searches MusicBrainz by artist/album
   - Associates result with disc position 47
   - Downloads and caches album art
6. **Future plays of disc 47:** Instant metadata display

### Alternative: Batch Import from Spreadsheet
If you already have a spreadsheet tracking your CDs:
1. Export spreadsheet as CSV
2. Create import script to populate database
3. Script queries MusicBrainz for each entry
4. Pre-populates database before going live

**MusicBrainz API Notes:**
- Free, open API (rate limit: 1 req/sec)
- No API key required
- Rich metadata and relationships
- Cover Art Archive integration
- Respectful usage required (user agent string)

---

## Implementation Phases

### Phase 1: Backend Foundation ⭐ Start Here
**Goal:** Get the server infrastructure running

**Tasks:**
1. Set up Raspberry Pi with chosen stack (Node.js/Python/Go)
2. Create SQLite database with schema
3. Build REST API endpoints:
   - `POST /api/state` - receive updates from ESP32
   - `GET /api/current` - get current playback state
   - `GET /api/disc/:position` - get disc metadata
   - `POST /api/disc/:position` - add/update disc metadata
   - `GET /api/search/musicbrainz?q=artist+album` - search proxy
4. Implement WebSocket server for real-time updates
5. Basic MusicBrainz client integration
6. Test with mock data

**Estimated Effort:** 2-3 focused sessions

---

### Phase 2: ESP32 Connectivity
**Goal:** Connect ESP32 to backend

**Tasks:**
1. Add WiFi credentials management (hardcoded or WiFi Manager)
2. Add HTTP client code
3. Post state changes to backend when disc/track changes
4. Handle network failures gracefully (queue updates, retry)
5. Add mDNS for easy Pi discovery (e.g., `http://cd-server.local`)

**Estimated Effort:** 1-2 sessions

---

### Phase 3: Basic Web UI
**Goal:** Display current playback state

**Tasks:**
1. Create simple web page served by backend
2. WebSocket connection to backend
3. Display current disc, track, state
4. Show placeholder if no metadata available
5. Auto-refresh on state changes

**Estimated Effort:** 1-2 sessions

**Milestone:** End-to-end system working with basic display! 🎉

---

### Phase 4: Metadata Enrichment
**Goal:** Add album art and track listings

**Tasks:**
1. Build admin UI for searching and assigning disc metadata
2. Implement MusicBrainz search and association
3. Download and cache album artwork
4. Store track listings in database
5. Update UI to show rich metadata

**Estimated Effort:** 2-3 sessions

---

### Phase 5: Polish & Features
**Goal:** Make it beautiful and feature-complete

**Tasks:**
- Improve UI design (CSS, animations, layouts)
- Add transition effects when tracks change
- Display track progress (if decoding time from S-Link)
- Add recently played history
- CD database management interface
- Backup/export database
- Mobile-friendly responsive design
- Optional: Physical buttons on ESP32 for control

**Estimated Effort:** Ongoing refinement

---

## Recommended Display Setup

**For your desktop monitor:**

**Simple Option:** Browser on your main computer
- Pi runs backend on your network
- Open browser to `http://raspberrypi.local:3000`
- Fullscreen it (F11)
- Position on your secondary monitor

**Dedicated Option:** Raspberry Pi 3/4 + Monitor
- Pi connected via HDMI to monitor
- Auto-boot to Chromium in kiosk mode
- No keyboard/mouse needed after setup
- Clean, dedicated display

**Kiosk Mode Setup (Raspberry Pi):**
```bash
# Install Chromium
sudo apt-get install chromium-browser unclutter

# Edit autostart
nano ~/.config/lxsession/LXDE-pi/autostart

# Add these lines:
@chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble http://localhost:3000
@unclutter -idle 0.1 -root
```

---

## Technology Recommendations

### Backend: Node.js + Express
**Why:**
- Fast development
- Great MusicBrainz libraries (`musicbrainz-api`)
- Easy WebSocket support (Socket.io)
- npm ecosystem

**Starter stack:**
```
- express (web server)
- better-sqlite3 (database)
- axios (HTTP client)
- socket.io (WebSockets)
- node-fetch (MusicBrainz API)
```

### Frontend: React or Vue.js
**Why:**
- Reactive updates perfect for real-time display
- Component-based UI
- Large ecosystem

**Alternative:** Plain HTML/CSS/JS with WebSocket
- Simpler if you want minimal tooling
- Perfectly adequate for this use case

---

## Decisions Made ✓

1. **Backend:** Node.js + Express
2. **Network:** Everything on same local network
3. **Display:** Dedicated Pi on monitor + mobile/laptop browsing capability
4. **CD Data:** CSV available with all 300 discs (Artist/Album)
5. **Additional Features:**
   - Control functionality (send commands to CD player)
   - Browse/search entire collection (jukebox mode)
   - Multi-device access (Pi display + phone/laptop)

## Enhanced Feature Set

### Jukebox Mode 🎵
- Browse complete 300-disc collection
- Search by artist, album, or disc number
- Click to play any disc/track
- View album art and track listings before playing
- Sort/filter options

### Control Features
- Play/Pause/Stop/Next/Previous
- Direct disc selection (1-300)
- Track selection
- Optional: Physical keypad/buttons on ESP32
- Web-based remote control from any device

### Multi-Device Access
- Primary display: Dedicated Pi on monitor (always-on kiosk)
- Secondary access: Any phone/laptop on network
- Responsive design adapts to screen size
- Same data, different layouts (large display vs. mobile)

---

## Next Steps

1. **Decision:** Choose backend technology stack
2. **Decision:** Choose display approach (browser on PC vs. dedicated Pi)
3. **Inventory:** Share spreadsheet format if available
4. **Setup:** Install chosen stack on Raspberry Pi
5. **Begin Phase 1:** Backend API development

---

## Additional Considerations

### Handling CD Swaps
Since CDs can be swapped in/out of positions:
- Database tracks position → metadata mapping
- Admin UI allows easy re-assignment
- "Unknown disc at position X" alerts when metadata missing
- Export/import for backup

### Performance
- SQLite easily handles 300 discs + tracks
- Local artwork caching eliminates repeated downloads
- WebSocket ensures instant UI updates (<100ms typical)

### Extensibility
Future ideas:
- Spotify/Apple Music integration (link to streaming)
- Playlist creation
- Statistics (most played discs/tracks)
- Integration with home automation
- Multi-room display sync

---

## Questions?

I'm happy to dive deeper into any of these areas or help with specific implementation details. What would you like to tackle first?
