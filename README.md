# Sony CX355 CD Jukebox System

A complete jukebox system for one or more Sony CDP‑CX355 CD changers, featuring an ESP32 S-Link interface, Node.js backend with automatic MusicBrainz metadata enrichment, and a web-based UI for browsing and playback control.

<img width="1291" height="1131" alt="image" src="https://github.com/user-attachments/assets/42eb943c-23e6-4e5c-a65a-31a6b13cb5f8" />

## What This Does

Transform your vintage CD changers into a modern jukebox:
- **Real-time tracking** of disc, track, and playback state via S-Link protocol
- **Remote control** via web API (play, pause, stop, next/prev, select disc)
- **Automatic metadata** from MusicBrainz (year, track listings, cover art)
- **Multi-player support** for two CD changers (600 disc capacity)

## Project Structure

```
sony-cx355-display/
├── firmware/          # ESP32 S-Link interface (PlatformIO)
├── backend/           # Node.js API server
├── CONTEXT.md         # AI assistant context (CLAUDE.md style)
├── ARCHITECTURE.md    # Technical architecture docs
└── PROJECT_PLAN.md    # Implementation roadmap
```

## Quick Start

### 1. Backend Server

```bash
cd backend
npm install

# Import your disc catalog
npm run import -- ../your-discs.csv

# Start server (advertises via mDNS for ESP32 discovery)
npm start
```

The backend auto-enriches discs with MusicBrainz metadata on first access.

### 2. ESP32 Firmware

```bash
cd firmware
cp include/secrets.h.example include/secrets.h  # Add WiFi credentials
pio run -t upload
pio device monitor  # Serial console for testing
```

Serial commands: `p` (play), `s` (stop), `d125` (play disc 125), `d125t5` (disc 125 track 5), `h` (help)

See [CONTEXT.md](CONTEXT.md) for S-Link protocol details.

## Current Status

| Component | Status |
|-----------|--------|
| S-Link RX decoding | ✅ Complete (all 300 discs, both players) |
| S-Link TX commands | ✅ Complete (play, stop, pause, next/prev, disc select) |
| ESP32 WiFi | ✅ Complete (auto-connect, mDNS discovery) |
| Backend API | ✅ Complete (REST endpoints, command queue) |
| MusicBrainz enrichment | ✅ Complete (auto-fetch on first access) |
| Cover art | ✅ Complete (from Cover Art Archive) |
| Web UI | ✅ Complete (browse, search, playback control) |

## Hardware

### ESP32 Interface
- ESP32 Dev Module (WROOM-32D)
- 2× 2N3904 transistors (RX + TX level shifting)
- RX: 10k pull-up to 3.3V, 22k base resistor
- TX: 1k base resistor
- Shared ground with CD player

### Sony Command Mode Setup
For two players, configure the rear switches:
- Player 1: Command Mode 1
- Player 2: Command Mode 3

## Architecture

```
┌─────────────┐    S-Link     ┌─────────┐    WiFi/HTTP    ┌─────────────┐
│ CD Player 1 │──────────────►│         │◄──────────────►│             │
│ CD Player 2 │──────────────►│  ESP32  │                 │   Backend   │
└─────────────┘               │         │────────────────►│  (Node.js)  │
                              └─────────┘   State updates │             │
                                    ▲                     │  ┌───────┐  │
                                    │                     │  │SQLite │  │
                              Commands from               │  └───────┘  │
                              command queue               │      ↓      │
                                                         │ MusicBrainz │
                                                         └─────────────┘
```

## API Examples

```bash
# Get current playback state
curl http://localhost:3000/api/current

# Get disc info (auto-enriches with MusicBrainz)
curl http://localhost:3000/api/discs/1/125

# Send play command
curl -X POST http://localhost:3000/api/command \
  -H "Content-Type: application/json" \
  -d '{"command": "play", "player": 1, "disc": 125, "track": 1}'

# View cover art
open http://localhost:3000/covers/p1-125.jpg
```

## Documentation

- [CONTEXT.md](CONTEXT.md) - Project context for AI assistants
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture diagrams
- [backend/README.md](backend/README.md) - Backend API documentation
- [backend/GETTING_STARTED.md](backend/GETTING_STARTED.md) - Backend setup guide

## Roadmap

**Completed:**
- [x] S-Link RX/TX firmware
- [x] ESP32 WiFi connectivity
- [x] Backend REST API
- [x] MusicBrainz auto-enrichment
- [x] Cover art download
- [x] Multi-player support

**Planned:**
- [x] Web UI for browsing and control
- [ ] Physical display on ESP32
- [ ] Disc management UI
- [ ] Playlist support

## License

MIT
