# Getting Started with CD Jukebox Backend

## Quick Start (5 minutes)

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Import Your CD Data
```bash
npm run import "../CD Player Contents.csv"
```

You should see:
```
✓ Import complete!
  - 300 new discs added
  - 0 existing discs updated
  - Total discs in database: 300
```

### 3. Start the Server
```bash
npm start
```

You should see:
```
╔═══════════════════════════════════════════╗
║   🎵 CD Jukebox Backend Server Running   ║
╚═══════════════════════════════════════════╝

  Port:        3000
  API:         http://localhost:3000/api
  ...
```

### 4. Test It!

Open another terminal and try:

```bash
# Get all discs
curl http://localhost:3000/api/discs | jq .

# Get disc #2 (Radiohead - OK Computer)
curl http://localhost:3000/api/discs/2 | jq .

# Search for Radiohead
curl "http://localhost:3000/api/discs?search=radiohead" | jq .

# Check health
curl http://localhost:3000/health | jq .
```

## Next Steps

### Option A: Enrich a Disc with MusicBrainz Data

Let's enrich disc #2 (Radiohead - OK Computer) as an example:

```bash
# Search MusicBrainz for the album
curl "http://localhost:3000/api/search/musicbrainz?artist=Radiohead&album=OK%20Computer" | jq .

# Enrich the disc (this will download cover art and track info)
curl -X POST http://localhost:3000/api/enrich/2 \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

Wait ~5 seconds for it to complete. Then check:

```bash
# View the enriched disc
curl http://localhost:3000/api/discs/2 | jq .

# View the cover art
open http://localhost:3000/covers/2.jpg
```

### Option B: Simulate Playback

```bash
# Simulate ESP32 reporting that disc 2, track 3 is playing
curl -X POST http://localhost:3000/api/state \
  -H "Content-Type: application/json" \
  -d '{"disc": 2, "track": 3, "state": "play"}' | jq .

# Check current playback state
curl http://localhost:3000/api/current | jq .
```

### Option C: Test Control Commands

```bash
# Queue a play command (as if from the UI)
curl -X POST http://localhost:3000/api/control/play \
  -H "Content-Type: application/json" \
  -d '{"disc": 42, "track": 1}' | jq .

# ESP32 would poll for this command
curl http://localhost:3000/api/esp32/poll | jq .

# ESP32 would acknowledge the command
curl -X POST http://localhost:3000/api/esp32/ack \
  -H "Content-Type: application/json" \
  -d '{"id": "<command-id-from-poll>", "success": true}' | jq .
```

## Testing WebSocket

Create a file `test-websocket.html`:

```html
<!DOCTYPE html>
<html>
<head><title>WebSocket Test</title></head>
<body>
  <h1>WebSocket Test</h1>
  <div id="messages"></div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io('http://localhost:3000');

    socket.on('connect', () => {
      console.log('Connected!');
      document.getElementById('messages').innerHTML += '<p>✓ Connected to server</p>';
      socket.emit('subscribe');
    });

    socket.on('state', (data) => {
      console.log('State update:', data);
      document.getElementById('messages').innerHTML +=
        `<p>🎵 Now playing: Disc ${data.current_disc}, Track ${data.current_track}</p>`;
    });

    socket.on('metadata_updated', (data) => {
      console.log('Metadata updated:', data);
      document.getElementById('messages').innerHTML +=
        `<p>📀 Metadata updated for disc ${data.position}</p>`;
    });
  </script>
</body>
</html>
```

Open it in a browser, then in another terminal:

```bash
# Update playback state and watch the WebSocket event
curl -X POST http://localhost:3000/api/state \
  -H "Content-Type: application/json" \
  -d '{"disc": 5, "track": 1, "state": "play"}'
```

You should see the WebSocket message appear in the browser!

## Development Tips

### Auto-reload on changes
```bash
npm run dev
```

### View database directly
```bash
sqlite3 data/jukebox.db
.tables
SELECT * FROM discs LIMIT 5;
.exit
```

### Re-import CSV (wipes database)
```bash
rm data/jukebox.db
npm run import "../CD Player Contents.csv"
```

### Check logs
The server logs all requests and WebSocket connections to stdout.

## Troubleshooting

### Port already in use
```bash
# Change port in .env
echo "PORT=3001" > .env
npm start
```

### Database locked
```bash
# Stop all instances
pkill -f "node.*server.js"
# Restart
npm start
```

### Missing dependencies
```bash
npm install
```

## What's Next?

1. **Build the Frontend** - Create the web UI to browse and control
2. **ESP32 Integration** - Add WiFi to your ESP32 firmware
3. **Enrich More Discs** - Use the MusicBrainz API to add metadata
4. **Deploy to Pi** - Follow instructions in README.md

Enjoy! 🎵
