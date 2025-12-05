# React Frontend Implementation Plan

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite (faster than CRA, better DX)
- **Styling**: Tailwind CSS (utility-first, quick to build)
- **State/Data**: TanStack Query (React Query) for API calls + caching
- **WebSocket**: socket.io-client for real-time updates
- **UI Components**: shadcn/ui (Radix-based, copy-paste components)

## Directory Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── NowPlaying.tsx   # Current track display + controls
│   │   ├── DiscGrid.tsx     # Grid view of all discs
│   │   ├── DiscCard.tsx     # Individual disc thumbnail
│   │   ├── DiscDetail.tsx   # Full disc view with tracks
│   │   ├── PlayerControls.tsx  # Transport buttons
│   │   ├── SearchBar.tsx    # Search/filter input
│   │   └── PlayerSelector.tsx  # Switch between player 1/2
│   ├── hooks/
│   │   ├── usePlaybackState.ts  # WebSocket subscription
│   │   ├── useDiscs.ts          # Disc list query
│   │   └── useCommands.ts       # Control command mutations
│   ├── lib/
│   │   ├── api.ts           # API client functions
│   │   ├── socket.ts        # Socket.IO setup
│   │   └── utils.ts         # Helpers
│   ├── types/
│   │   └── index.ts         # TypeScript interfaces
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css            # Tailwind imports
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## V1 Features

### 1. Now Playing Bar (top or bottom)
- Current disc: cover art, artist, album, track title
- Transport controls: prev, play/pause, stop, next
- Real-time updates via WebSocket

### 2. Disc Browser (main area)
- Grid of disc cards showing cover art + artist/album
- Search bar (filters by artist/album)
- Player filter (All / Player 1 / Player 2)
- Click disc to start playing OR view details

### 3. Disc Detail Modal/Panel
- Large cover art
- Full track listing
- Click track to play from that track
- Basic metadata (year, track count, duration)

### 4. Stats & History
- Recently played discs
- Most played discs
- Basic play statistics

## Implementation Steps

### Phase 1: Project Setup
1. Initialize Vite + React + TypeScript project in `frontend/`
2. Install dependencies (Tailwind, React Query, socket.io-client)
3. Set up shadcn/ui
4. Configure Vite proxy for API calls during dev
5. Create TypeScript types from API responses

### Phase 2: Core Infrastructure
1. Create API client (`lib/api.ts`)
2. Set up Socket.IO client (`lib/socket.ts`)
3. Create React Query provider and hooks
4. Build `usePlaybackState` hook for real-time state

### Phase 3: Components
1. Build basic UI components (Button, Card, Input)
2. Create DiscCard component
3. Create DiscGrid with search/filter
4. Create NowPlaying bar with controls
5. Create DiscDetail modal

### Phase 4: Integration
1. Wire up play commands to API
2. Test real-time updates
3. Handle loading/error states
4. Add keyboard shortcuts (space=pause, arrows=prev/next)

### Phase 5: Polish
1. Responsive design (works on tablet/phone)
2. Loading skeletons
3. Empty states
4. Build output to `backend/public/`

## API Integration

### Queries (GET)
```typescript
// List discs
GET /api/discs?player=1&search=beatles&limit=50&offset=0
→ { discs: Disc[], total: number }

// Get single disc with tracks
GET /api/discs/:player/:position
→ Disc & { tracks: Track[] }

// Current playback
GET /api/current
→ PlaybackState
```

### Mutations (POST)
```typescript
POST /api/control/play   { player, disc, track? }
POST /api/control/pause
POST /api/control/stop
POST /api/control/next
POST /api/control/previous
```

### WebSocket Events
```typescript
// Subscribe on connect
socket.emit('subscribe')

// Listen for state changes
socket.on('state', (state: PlaybackState) => ...)
socket.on('metadata_updated', ({player, position}) => ...)
```

## TypeScript Interfaces

```typescript
interface Disc {
  id: number;
  player: 1 | 2;
  position: number;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  cover_art_path?: string;
  track_count?: number;
  duration_seconds?: number;
  play_count: number;
  last_played?: string;
}

interface Track {
  track_number: number;
  title: string;
  duration_seconds?: number;
}

interface PlaybackState {
  current_player: 1 | 2 | null;
  current_disc: number | null;
  current_track: number | null;
  state: 'play' | 'pause' | 'stop' | null;
  artist?: string;
  album?: string;
  track_title?: string;
}
```

## Dev/Build Commands

```bash
# Development (with hot reload)
cd frontend && npm run dev
# → http://localhost:5173 (proxies API to :3000)

# Production build
cd frontend && npm run build
# → outputs to ../backend/public/

# Run everything
cd backend && npm start
# → serves API + frontend on :3000
```

## Design Decisions

- **Dark mode by default** - Fits the audio equipment aesthetic
- **Desktop-first, responsive** - Optimized for desktop but usable on mobile for control
- **Pagination** - For browsing 600 discs

---

## V2+ Future Features

### Rating & Flagging System
- **Star ratings** - Mark favorite albums (1-5 stars or simple favorite toggle)
- **Flag for removal** - Mark discs to replace/remove later
- Filtering by starred/flagged status

### Admin Functions
- **Disc management** - Add, edit, delete discs
- **Manual metadata entry** - For discs not in MusicBrainz
- **Bulk operations** - Re-scan, re-enrich multiple discs

### MusicBrainz Match Fixer
When auto-match fails or finds the wrong release:
- **Search UI** - Search MusicBrainz directly with different terms
- **Release picker** - Show multiple results, preview track listings, pick correct one
- **Fuzzy matching** - Try variations (with/without "The", different punctuation, etc.)
- **Manual MBID entry** - Paste a MusicBrainz release URL/ID directly
- **Mark as "no match"** - Skip enrichment for discs not in MusicBrainz
- **Enrichment status indicator** - Show which discs failed enrichment in the UI

### Additional Features
- **Playlist/queue support** - Queue up multiple discs/tracks
- **Play history** - Full playback log
- **Statistics dashboard** - Most played, listening trends
- **Keyboard shortcuts** - Power user controls
