# CD Jukebox Backend

Node.js backend server for the Sony CX355 CD Jukebox system. Supports two 300-disc CD changers (600 CDs total).

## Features

- REST API for disc management and playback control
- WebSocket support for real-time updates
- SQLite database for disc metadata
- MusicBrainz integration with auto-enrichment on first access
- Cover art download from Cover Art Archive
- ESP32 command queue and polling
- mDNS service advertisement for ESP32 discovery
- CSV import for bulk disc data

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Import CD Data

```bash
# Import as player 1
npm run import -- ../your-discs.csv

# Import as player 2
npm run import -- ../your-discs.csv --player 2
```

CSV format: `Disc #,Artist,Album` (optional: `Player` column)

### 3. Start Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server starts on port 3000 and advertises via mDNS as `_cdjukebox._tcp`.

## API Endpoints

### Disc Management

- `GET /api/discs` - List all discs
  - Query params: `player`, `search`, `sort`, `limit`, `offset`
- `GET /api/discs/:player/:position` - Get disc with tracks (auto-enriches if needed)
- `POST /api/discs/:player/:position` - Update disc metadata

### Playback State

- `GET /api/current` - Get current playback state with disc metadata
- `POST /api/state` - Update playback state (from ESP32)
  - Body: `{player, disc, track, state}`

### Control Commands

- `POST /api/command` - Queue a command for ESP32
  - Body: `{command, player?, disc?, track?}`
  - Commands: `play`, `pause`, `stop`, `next`, `previous`

### ESP32 Communication

- `GET /api/esp32/poll` - Poll for pending commands
- `POST /api/esp32/ack` - Acknowledge command execution
  - Body: `{id, success}`

### MusicBrainz Integration

- `POST /api/enrich/:player/:position` - Force re-enrichment
  - Body: `{}` or `{releaseId: "mbid-..."}`

Note: Enrichment happens automatically on first `GET /api/discs/:player/:position` if metadata is missing.

### Statistics

- `GET /api/stats` - Get playback statistics

## Example Usage

### Get disc info (auto-enriches with MusicBrainz)
```bash
curl "http://localhost:3000/api/discs/1/42"
```

### Search for discs
```bash
curl "http://localhost:3000/api/discs?search=radiohead"
```

### Filter by player
```bash
curl "http://localhost:3000/api/discs?player=1"
```

### Play a disc
```bash
curl -X POST http://localhost:3000/api/command \
  -H "Content-Type: application/json" \
  -d '{"command": "play", "player": 1, "disc": 42, "track": 1}'
```

### Get current playback state
```bash
curl "http://localhost:3000/api/current"
```

### View cover art
```bash
open http://localhost:3000/covers/p1-42.jpg
```

## Directory Structure

```
backend/
├── src/
│   ├── routes/
│   │   └── api.js              # API route handlers
│   ├── services/
│   │   ├── database.js         # Database operations
│   │   └── musicbrainz.js      # MusicBrainz integration
│   ├── db/
│   │   └── schema.js           # Database schema
│   ├── scripts/
│   │   └── import-csv.js       # CSV import script
│   └── server.js               # Main server file
├── data/
│   ├── jukebox.db              # SQLite database
│   └── covers/                 # Cover art cache (p{player}-{position}.jpg)
├── package.json
└── README.md
```

## Database Schema

### `discs` table
- `id` (primary key)
- `player` (1 or 2)
- `position` (1-300)
- `artist`, `album`
- `musicbrainz_id`, `year`, `genre`
- `cover_art_path`
- `track_count`, `duration_seconds`
- `play_count`, `last_played`
- UNIQUE constraint on `(player, position)`

### `tracks` table
- `disc_id` (foreign key)
- `track_number`
- `title`, `duration_seconds`

### `playback_state` table
- `current_player`, `current_disc`, `current_track`
- `state` (play/pause/stop)

### `command_queue` table
- `id`, `command`, `player`, `disc`, `track`
- `acknowledged`

## Development

### Run with auto-reload
```bash
npm run dev
```

### Re-import CSV data
```bash
npm run import -- ../your-discs.csv
npm run import -- ../your-discs.csv --player 2
```

## Production Deployment (Raspberry Pi)

### 1. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Clone and setup
```bash
cd /home/pi
git clone <repo-url> sony-cx355-display
cd sony-cx355-display/backend
npm install
npm run import -- ../your-discs.csv
```

### 3. Run with PM2
```bash
npm install -g pm2
pm2 start src/server.js --name cd-jukebox
pm2 save
pm2 startup
```

### 4. Access
- API: `http://<raspberry-pi-ip>:3000/api`
- Cover art: `http://<raspberry-pi-ip>:3000/covers/p1-42.jpg`

## License

MIT
