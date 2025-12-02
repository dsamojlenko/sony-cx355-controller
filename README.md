# Sony CX355 CD Jukebox System

A complete jukebox system for the Sony CDP‑CX355 300-disc CD changer, featuring ESP32 S-Link interface, Node.js backend, and web-based display.

## 🎵 What This Does

Transform your vintage CD changer into a modern jukebox:
- **Real-time display** of album art, track listings, and playback status
- **Browse and search** all 300 CDs from any device
- **Remote control** via web interface (phone, tablet, computer)
- **Automatic metadata** from MusicBrainz (album info, cover art, tracks)

## 📁 Project Structure

```
sony-cx355-controller/
├── firmware/          # ESP32 S-Link interface (PlatformIO)
├── backend/           # Node.js API server
├── mockup.html        # UI design preview
├── PROJECT_PLAN.md    # Detailed implementation plan
├── ARCHITECTURE.md    # Technical architecture docs
└── CONTEXT.md         # S-Link protocol documentation
```

## 🚀 Quick Start

### 1. ESP32 Firmware (Already Working!)
The ESP32 can already decode S-Link frames from the CD player.

**Build and upload:**
```bash
cd firmware
pio run -t upload
```

See [CONTEXT.md](CONTEXT.md) for S-Link protocol details.

### 2. Backend Server (NEW!)
Node.js server with REST API, WebSocket, and MusicBrainz integration.

**Setup:**
```bash
cd backend
npm install
npm run import "../CD Player Contents.csv"
npm start
```

See [backend/GETTING_STARTED.md](backend/GETTING_STARTED.md) for detailed instructions.

**Features:**
- REST API for disc management and playback control
- WebSocket for real-time updates
- SQLite database (300 discs imported from CSV)
- MusicBrainz integration for metadata enrichment
- ESP32 command queue and polling

### 3. Web UI (Coming Soon)
Modern web interface for browsing and controlling your CD collection.

**Preview:** Open [mockup.html](mockup.html) in a browser to see the design!

## 🎯 Current Status

- ✅ **ESP32 Firmware** - S-Link RX/TX working
- ✅ **Backend API** - Complete and ready to test
- ✅ **CSV Import** - All 300 discs loaded
- ✅ **MusicBrainz Integration** - Metadata enrichment ready
- ✅ **UI Mockup** - Design approved
- ⏳ **Web UI** - Next phase
- ⏳ **ESP32 WiFi** - To be added

## 🔧 Hardware Requirements

### ESP32 Interface
- ESP32 Dev Module (WROOM-32D)
- 2× 2N3904 transistors (RX + TX)
- RX: 47k pull-up, 22k base resistor
- TX: 22k base resistor
- Shared ground with CD player

### Display
- Raspberry Pi 3/4 (for backend + HDMI display)
- Monitor (HDMI)
- OR: Any computer/phone with web browser

## 📖 Documentation

- [PROJECT_PLAN.md](PROJECT_PLAN.md) - Implementation roadmap and phases
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture and data flows
- [CONTEXT.md](CONTEXT.md) - S-Link protocol reverse engineering
- [backend/README.md](backend/README.md) - Backend API documentation
- [backend/GETTING_STARTED.md](backend/GETTING_STARTED.md) - Backend quick start guide

## 🧪 Test the Backend

```bash
# Get all discs
curl http://localhost:3000/api/discs | jq .

# Get disc #2 (Radiohead - OK Computer)
curl http://localhost:3000/api/discs/2 | jq .

# Enrich with MusicBrainz metadata
curl -X POST http://localhost:3000/api/enrich/2 \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

# View cover art
open http://localhost:3000/covers/2.jpg
```

## 🎨 UI Preview

Open [mockup.html](mockup.html) to see a high-fidelity mockup of the album detail view, featuring:
- Real MusicBrainz data for Radiohead's OK Computer
- Album artwork from Cover Art Archive
- Complete track listings
- Transport controls
- Recently played carousel
- Quick action buttons

## 📡 Architecture

```
CD Player ──S-Link──> ESP32 ──WiFi/HTTP──> Backend (Pi) ──WebSocket──> Web UI
                                              ↓
                                         MusicBrainz API
                                         SQLite Database
```

## 🛣️ Roadmap

**Phase 1: Backend** ✅ COMPLETE
- [x] Database schema
- [x] REST API
- [x] WebSocket support
- [x] MusicBrainz integration
- [x] CSV import

**Phase 2: ESP32 WiFi** (Next)
- [ ] WiFi client
- [ ] HTTP state updates
- [ ] Command polling
- [ ] S-Link TX expansion

**Phase 3: Web UI** (In Progress)
- [ ] Now Playing view
- [ ] Browse/search interface
- [ ] Control interface
- [ ] Mobile responsive

**Phase 4: Metadata Enrichment**
- [ ] Admin UI for MusicBrainz search
- [ ] Bulk enrichment tools
- [ ] Cover art management

**Phase 5: Polish**
- [ ] Statistics dashboard
- [ ] Playlist support
- [ ] Enhanced animations
- [ ] Physical controls (optional)

## 🤝 Contributing

This is a personal project, but feel free to fork and adapt for your own vintage CD changers!

## 📄 License

MIT
