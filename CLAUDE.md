# CLAUDE.md — Sony CX355 CD Jukebox Project

This file provides context for AI assistants working on this codebase.

## Project Summary

A custom display and control system for two Sony CDP-CX355 300-disc CD changers. An ESP32 connects to the Sony S-Link bus to:
1. **Receive** playback status (disc, track, play/pause/stop state)
2. **Transmit** control commands (play disc X track Y, next, previous, etc.)
3. **Communicate** with a Node.js backend via WiFi for metadata and web UI

Total capacity: 600 CDs (300 per player).

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| S-Link RX decoding | ✅ Complete | All 300 discs, both players |
| S-Link TX commands | ✅ Complete | Play, stop, pause, next/prev, disc select |
| ESP32 WiFi | ✅ Complete | Auto-connects, mDNS discovery |
| Backend API | ✅ Complete | REST endpoints for state and control |
| MusicBrainz enrichment | ✅ Complete | Auto-fetches metadata on first access |
| Cover art | ✅ Complete | Downloads from Cover Art Archive |
| Web UI | 🚧 Planned | Not yet implemented |
| Physical display | 🚧 Planned | ESP32 display hardware not connected |

## Directory Structure

```
sony-cx355-display/
├── firmware/               # ESP32 PlatformIO project
│   ├── src/
│   │   ├── main.cpp       # Entry point, serial commands, backend integration
│   │   ├── SlinkDecoder.cpp/h  # S-Link RX: pulse decoding, frame parsing
│   │   ├── SlinkTx.cpp/h       # S-Link TX: sending commands
│   │   └── BackendClient.cpp/h # WiFi, mDNS discovery, HTTP client
│   ├── include/
│   │   └── secrets.h      # WiFi credentials (git-ignored)
│   └── platformio.ini
├── backend/                # Node.js Express server
│   ├── src/
│   │   ├── server.js      # Entry point, mDNS advertisement
│   │   ├── routes/api.js  # REST API endpoints
│   │   ├── services/
│   │   │   ├── database.js     # SQLite wrapper
│   │   │   └── musicbrainz.js  # MusicBrainz API client
│   │   ├── db/schema.js   # Database schema
│   │   └── scripts/import-csv.js  # Bulk disc import
│   ├── data/              # SQLite database, cover art
│   └── package.json
├── CONTEXT.md             # This file
├── ARCHITECTURE.md        # Technical diagrams
└── PROJECT_PLAN.md        # Feature roadmap
```

## Key Concepts

### Multi-Player Support
Each disc is identified by `(player, position)`:
- `player`: 1 or 2 (physical unit)
- `position`: 1-300 (slot number)

The Sony "Command Mode" switch on each unit determines its S-Link address:
- **Player 1**: Command Mode 1 (addresses 0x40/0x45)
- **Player 2**: Command Mode 3 (addresses 0x44/0x51)

### S-Link Protocol
Single-wire, open-collector, 5V bus with pulse-width encoding:
- **Idle**: Line high
- **Bit 0**: ~600µs low, ~600µs high
- **Bit 1**: ~1200µs low, ~600µs high
- **Start**: ~2400µs low pulse

The ESP32 uses a transistor interface (never drives 5V directly).

### Auto-Enrichment
When a disc is first accessed via API, the backend automatically:
1. Searches MusicBrainz for artist + album
2. Fetches year, track listing, duration
3. Downloads cover art from Cover Art Archive
4. Caches everything in SQLite

Rate-limited to 1 request/second per MusicBrainz requirements.

## Working with the Code

### Firmware Development
```bash
cd firmware
cp include/secrets.h.example include/secrets.h  # Add WiFi creds
pio run -t upload                                # Flash ESP32
pio device monitor                               # Serial console
```

Serial commands for testing:
- `p` - Play, `s` - Stop, `a` - Pause
- `n` - Next track, `b` - Previous track
- `d125` - Play disc 125, `d125t5` - Play disc 125 track 5
- `2d50` - Play disc 50 on player 2
- `h` - Show all commands

### Backend Development
```bash
cd backend
npm install
npm run dev          # Start with auto-reload
npm run import -- /path/to/discs.csv  # Import disc catalog
```

The backend advertises itself via mDNS as `_cdjukebox._tcp` for ESP32 discovery.

### Importing Disc Data
CSV format: `Disc #,Artist,Album` (optional: `Player` column)
```bash
npm run import -- ./discs.csv           # Import as player 1
npm run import -- ./discs.csv --player 2  # Import as player 2
```

## Database Schema

**discs** table:
| Column | Type | Notes |
|--------|------|-------|
| player | INTEGER | 1 or 2 |
| position | INTEGER | 1-300 |
| artist | TEXT | Required |
| album | TEXT | Required |
| musicbrainz_id | TEXT | Release MBID |
| year | INTEGER | From MusicBrainz |
| genre | TEXT | |
| cover_art_path | TEXT | e.g., `covers/p1-125.jpg` |
| track_count | INTEGER | |
| play_count | INTEGER | Incremented on play |
| last_played | DATETIME | |

**tracks** table: `disc_id`, `track_number`, `title`, `duration_seconds`

**playback_state** table: Single row tracking current player/disc/track/state

**command_queue** table: Pending commands for ESP32 polling

## API Reference

### State Endpoints
- `GET /api/current` - Current playback state with disc metadata
- `POST /api/state` - Update state (from ESP32): `{player, disc, track, state}`

### Disc Endpoints
- `GET /api/discs` - List all discs (query: `player`, `search`, `sort`)
- `GET /api/discs/:player/:position` - Get disc (auto-enriches if needed)
- `POST /api/discs/:player/:position` - Update disc metadata

### Control Endpoints
- `POST /api/command` - Queue command: `{command, player?, disc?, track?}`
- `GET /api/esp32/poll` - ESP32 polls for pending commands
- `POST /api/esp32/ack` - ESP32 acknowledges command: `{id}`

### Metadata Endpoints
- `POST /api/enrich/:player/:position` - Force MusicBrainz re-enrichment
- `GET /api/stats` - Play statistics

## S-Link Protocol Reference

### Frame Types (RX)

**Status Frame (12 bytes)**:
```
41 [DEV] 11 00 [D1] [D2] [T1] [T2] [X1] [X2] [X3] [X4]
```
- DEV: Device code (0x40/0x45 for Mode 1, 0x44/0x51 for Mode 3)
- D1/D2: Disc number (BCD-encoded with special handling for 100+)
- T1/T2: Track number (BCD)

**Transport Frame (4 bytes)**:
```
41 [DEV] 00 [CODE]
```
Codes: 0x00=play, 0x01=stop, 0x04=pause, 0x40=loading

### TX Commands

**Device addresses** (first byte):
| Player | Discs 1-200 | Discs 201-300 |
|--------|-------------|---------------|
| 1 | 0x90 | 0x93 |
| 2 | 0x92 | 0x95 |

**Command codes** (second byte):
| Code | Command |
|------|---------|
| 0x00 | Play |
| 0x01 | Stop |
| 0x03 | Pause (toggle) |
| 0x08 | Next track |
| 0x09 | Previous track |
| 0x50 | Play disc/track (+ 2 param bytes) |
| 0x2E | Power on |
| 0x2F | Power off |

**Disc encoding for TX**:
- 1-99: Standard BCD (disc 50 → 0x50)
- 100-200: (disc - 100) + 0x9A (disc 150 → 0xCC)
- 201-300: Raw byte (disc - 200) using high-range address

## Known Limitations

1. **No status request command**: The CD changer only broadcasts on state changes. On startup, state is unknown until the first status frame.

2. **Time frames only from Mode 3**: Elapsed time tracking only works when the Mode 3 device is playing.

3. **Cover art depends on MusicBrainz**: Albums not in MusicBrainz won't get cover art automatically.

## Future Work

- **Web UI**: React/Vue frontend for browsing and controlling playback
- **Physical display**: Connect LCD/OLED to ESP32 for standalone display
- **Disc management UI**: Add/edit/delete discs, manual metadata entry
- **Playlist support**: Queue multiple discs/tracks
- **Multi-room audio**: Coordinate multiple CD changers
