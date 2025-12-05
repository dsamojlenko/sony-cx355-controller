const express = require('express');
const DatabaseService = require('../services/database');
const MusicBrainzService = require('../services/musicbrainz');

const router = express.Router();
const db = new DatabaseService();
const musicbrainz = new MusicBrainzService();

/**
 * GET /api/discs
 * List all discs with optional search and pagination
 * Query params: player (1 or 2), search, sort, limit, offset
 */
router.get('/discs', (req, res) => {
  try {
    const { player, search, sort, limit, offset } = req.query;

    const result = db.getDiscs({
      player: player ? parseInt(player) : null,
      search,
      sort,
      limit: limit ? parseInt(limit) : 600,
      offset: offset ? parseInt(offset) : 0
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching discs:', error);
    res.status(500).json({ error: 'Failed to fetch discs' });
  }
});

/**
 * GET /api/discs/:player/:position
 * Get single disc with tracks
 * Auto-enriches with MusicBrainz data if not already enriched
 */
router.get('/discs/:player/:position', async (req, res) => {
  try {
    const player = parseInt(req.params.player);
    const position = parseInt(req.params.position);
    let disc = db.getDisc(player, position);

    if (!disc) {
      return res.status(404).json({ error: 'Disc not found' });
    }

    // Auto-enrich if needed (no musicbrainz data yet)
    if (musicbrainz.needsEnrichment(disc)) {
      try {
        console.log(`[API] Auto-enriching P${player}-${position}: ${disc.artist} - ${disc.album}`);
        const metadata = await musicbrainz.enrichDisc(player, position, disc.artist, disc.album);

        // Update database
        db.upsertDisc(player, position, { ...disc, ...metadata });
        if (metadata.tracks && metadata.tracks.length > 0) {
          db.setTracks(disc.id, metadata.tracks);
        }

        // Re-fetch with updated data
        disc = db.getDisc(player, position);

        // Broadcast update to WebSocket clients
        if (req.app.get('io')) {
          req.app.get('io').emit('metadata_updated', { player, position });
        }
      } catch (enrichError) {
        // Log but don't fail - return disc without enrichment
        console.error(`[API] Auto-enrich failed for P${player}-${position}:`, enrichError.message);
      }
    }

    res.json(disc);
  } catch (error) {
    console.error('Error fetching disc:', error);
    res.status(500).json({ error: 'Failed to fetch disc' });
  }
});

/**
 * POST /api/discs/:player/:position
 * Update disc metadata
 */
router.post('/discs/:player/:position', (req, res) => {
  try {
    const player = parseInt(req.params.player);
    const position = parseInt(req.params.position);
    const data = req.body;

    db.upsertDisc(player, position, data);

    // Get disc to obtain id for tracks
    const disc = db.getDisc(player, position);

    // If tracks provided, update them
    if (data.tracks && Array.isArray(data.tracks) && disc) {
      db.setTracks(disc.id, data.tracks);
    }

    const updated = db.getDisc(player, position);
    res.json(updated);
  } catch (error) {
    console.error('Error updating disc:', error);
    res.status(500).json({ error: 'Failed to update disc' });
  }
});

/**
 * GET /api/current
 * Get current playback state
 */
router.get('/current', (req, res) => {
  try {
    const state = db.getPlaybackState();
    res.json(state);
  } catch (error) {
    console.error('Error fetching playback state:', error);
    res.status(500).json({ error: 'Failed to fetch playback state' });
  }
});

/**
 * POST /api/state
 * Update playback state (called by ESP32)
 */
router.post('/state', (req, res) => {
  try {
    const { player, disc, track, state } = req.body;

    console.log(`[API] State update received: player=${player} disc=${disc} track=${track} state=${state}`);

    if (!player || !disc || !track || !state) {
      return res.status(400).json({ error: 'Missing required fields (player, disc, track, state)' });
    }

    db.updatePlaybackState(player, disc, track, state);

    // Broadcast to WebSocket clients
    if (req.app.get('io')) {
      const playbackState = db.getPlaybackState();
      console.log('[API] Broadcasting state via WebSocket:', playbackState?.state);
      req.app.get('io').emit('state', playbackState);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating state:', error);
    res.status(500).json({ error: 'Failed to update state' });
  }
});

/**
 * POST /api/control/play
 * Play specific disc/track
 */
router.post('/control/play', (req, res) => {
  try {
    const { player, disc, track } = req.body;

    if (!player || !disc) {
      return res.status(400).json({ error: 'Player and disc number required' });
    }

    const cmd = db.queueCommand('play', player, disc, track || 1);
    res.json({ success: true, queued: true, commandId: cmd.id });
  } catch (error) {
    console.error('Error queueing play command:', error);
    res.status(500).json({ error: 'Failed to queue command' });
  }
});

/**
 * POST /api/control/pause
 * Pause playback
 */
router.post('/control/pause', (req, res) => {
  try {
    const cmd = db.queueCommand('pause');
    res.json({ success: true, queued: true, commandId: cmd.id });
  } catch (error) {
    console.error('Error queueing pause command:', error);
    res.status(500).json({ error: 'Failed to queue command' });
  }
});

/**
 * POST /api/control/stop
 * Stop playback
 */
router.post('/control/stop', (req, res) => {
  try {
    const cmd = db.queueCommand('stop');
    res.json({ success: true, queued: true, commandId: cmd.id });
  } catch (error) {
    console.error('Error queueing stop command:', error);
    res.status(500).json({ error: 'Failed to queue command' });
  }
});

/**
 * POST /api/control/next
 * Next track
 */
router.post('/control/next', (req, res) => {
  try {
    const cmd = db.queueCommand('next');
    res.json({ success: true, queued: true, commandId: cmd.id });
  } catch (error) {
    console.error('Error queueing next command:', error);
    res.status(500).json({ error: 'Failed to queue command' });
  }
});

/**
 * POST /api/control/previous
 * Previous track
 */
router.post('/control/previous', (req, res) => {
  try {
    const cmd = db.queueCommand('previous');
    res.json({ success: true, queued: true, commandId: cmd.id });
  } catch (error) {
    console.error('Error queueing previous command:', error);
    res.status(500).json({ error: 'Failed to queue command' });
  }
});

/**
 * GET /api/esp32/poll
 * ESP32 polls for pending commands
 */
router.get('/esp32/poll', (req, res) => {
  try {
    const cmd = db.getPendingCommand();

    if (cmd) {
      res.json(cmd);
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error polling commands:', error);
    res.status(500).json({ error: 'Failed to poll commands' });
  }
});

/**
 * POST /api/esp32/ack
 * ESP32 acknowledges command execution
 */
router.post('/esp32/ack', (req, res) => {
  try {
    const { id, success } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Command ID required' });
    }

    db.acknowledgeCommand(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error acknowledging command:', error);
    res.status(500).json({ error: 'Failed to acknowledge command' });
  }
});

/**
 * GET /api/search/musicbrainz
 * Search MusicBrainz for releases
 */
router.get('/search/musicbrainz', async (req, res) => {
  try {
    const { artist, album } = req.query;

    if (!artist || !album) {
      return res.status(400).json({ error: 'Artist and album required' });
    }

    const suggestions = await musicbrainz.getSuggestions(artist, album);
    res.json(suggestions);
  } catch (error) {
    console.error('MusicBrainz search error:', error);
    res.status(500).json({ error: 'Failed to search MusicBrainz' });
  }
});

/**
 * GET /api/musicbrainz/release/:mbid
 * Lookup a single MusicBrainz release by ID
 */
router.get('/musicbrainz/release/:mbid', async (req, res) => {
  try {
    const { mbid } = req.params;

    if (!mbid || mbid.length !== 36) {
      return res.status(400).json({ error: 'Valid MusicBrainz ID required' });
    }

    const metadata = await musicbrainz.getRelease(mbid);

    // Format response like getSuggestions for consistency
    res.json({
      id: metadata.musicbrainz_id,
      title: metadata.album,
      artist: metadata.artist || 'Unknown',
      date: metadata.year ? String(metadata.year) : 'Unknown',
      country: 'Unknown',
      label: 'Unknown',
      format: 'CD',
      mediaCount: metadata.media_count || 1,
      coverArtUrl: `https://coverartarchive.org/release/${mbid}/front-250`
    });
  } catch (error) {
    console.error('MusicBrainz lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup release' });
  }
});

/**
 * POST /api/enrich/:player/:position
 * Enrich disc with MusicBrainz data
 */
router.post('/enrich/:player/:position', async (req, res) => {
  try {
    const player = parseInt(req.params.player);
    const position = parseInt(req.params.position);
    const { musicbrainzId, mediumPosition } = req.body;

    // Get current disc info
    const disc = db.getDisc(player, position);
    if (!disc) {
      return res.status(404).json({ error: 'Disc not found' });
    }

    // Enrich with MusicBrainz (mediumPosition for multi-disc releases)
    const metadata = await musicbrainz.enrichDisc(
      player,
      position,
      disc.artist,
      disc.album,
      musicbrainzId,
      mediumPosition || 1
    );

    // Update database
    db.upsertDisc(player, position, metadata);
    if (metadata.tracks) {
      db.setTracks(disc.id, metadata.tracks);
    }

    // Broadcast update to WebSocket clients
    if (req.app.get('io')) {
      req.app.get('io').emit('metadata_updated', { player, position, metadata });
    }

    const updated = db.getDisc(player, position);
    res.json(updated);
  } catch (error) {
    console.error('Enrichment error:', error);
    res.status(500).json({ error: error.message || 'Failed to enrich disc' });
  }
});

/**
 * GET /api/stats
 * Get statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
