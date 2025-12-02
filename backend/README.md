# CD Jukebox Backend

Node.js backend server for the Sony CX355 CD Jukebox system.

## Features

- ✅ REST API for disc management and playback control
- ✅ WebSocket support for real-time updates
- ✅ SQLite database for disc metadata
- ✅ MusicBrainz integration for album info and cover art
- ✅ ESP32 command queue and polling
- ✅ CSV import for bulk disc data

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Import CD Data

```bash
npm run import "../CD Player Contents.csv"
```

This will create the database and import all 300 discs from your CSV file.

### 3. Start Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will start on port 3000 (or the port specified in `.env`).

## API Endpoints

### Disc Management

- `GET /api/discs` - List all discs (with search/pagination)
  - Query params: `search`, `sort`, `limit`, `offset`
- `GET /api/discs/:position` - Get single disc with tracks
- `POST /api/discs/:position` - Update disc metadata

### Playback

- `GET /api/current` - Get current playback state
- `POST /api/state` - Update playback state (from ESP32)

### Control

- `POST /api/control/play` - Play disc/track
- `POST /api/control/pause` - Pause playback
- `POST /api/control/stop` - Stop playback
- `POST /api/control/next` - Next track
- `POST /api/control/previous` - Previous track

### ESP32 Communication

- `GET /api/esp32/poll` - Poll for pending commands
- `POST /api/esp32/ack` - Acknowledge command execution

### MusicBrainz Integration

- `GET /api/search/musicbrainz?artist=...&album=...` - Search for releases
- `POST /api/enrich/:position` - Enrich disc with MusicBrainz data
  - Body: `{ "musicbrainzId": "..." }` (optional)

### Statistics

- `GET /api/stats` - Get playback statistics

## WebSocket Events

**Client → Server:**
- `subscribe` - Subscribe to updates
- `unsubscribe` - Unsubscribe from updates

**Server → Client:**
- `state` - Playback state changed
- `metadata_updated` - Disc metadata updated

## Example Usage

### Search for discs
```bash
curl "http://localhost:3000/api/discs?search=radiohead"
```

### Get disc details
```bash
curl "http://localhost:3000/api/discs/2"
```

### Play a disc
```bash
curl -X POST http://localhost:3000/api/control/play \
  -H "Content-Type: application/json" \
  -d '{"disc": 2, "track": 1}'
```

### Enrich disc with MusicBrainz data
```bash
# First, search for the release
curl "http://localhost:3000/api/search/musicbrainz?artist=Radiohead&album=OK%20Computer"

# Then enrich with the chosen release ID
curl -X POST http://localhost:3000/api/enrich/2 \
  -H "Content-Type: application/json" \
  -d '{"musicbrainzId": "e16cda60-6e6d-4a32-8d7c-e12d9aeb72de"}'
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
│   └── jukebox.db              # SQLite database (created on init)
├── public/
│   └── covers/                 # Cover art cache
├── package.json
└── README.md
```

## Database Schema

### `discs` table
- `position` (1-300)
- `artist`, `album`
- `musicbrainz_id`, `year`, `genre`
- `cover_art_path`
- `track_count`, `duration_seconds`
- `play_count`, `last_played`

### `tracks` table
- `disc_position`, `track_number`
- `title`, `duration_seconds`

### `playback_state` table
- `current_disc`, `current_track`
- `state` (play/pause/stop)

### `command_queue` table
- `id`, `command`, `disc`, `track`
- `acknowledged`

## Development

### Run with auto-reload
```bash
npm run dev
```

### Re-import CSV data
```bash
npm run import "../CD Player Contents.csv"
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
git clone <repo-url> sony-cx355-controller
cd sony-cx355-controller/backend
npm install
npm run import "../CD Player Contents.csv"
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
- Web UI: `http://<raspberry-pi-ip>:3000`

## License

MIT
