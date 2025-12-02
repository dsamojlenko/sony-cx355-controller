const express = require('express');
const DatabaseService = require('../services/database');
const MusicBrainzService = require('../services/musicbrainz');

const router = express.Router();
const db = new DatabaseService();
const musicbrainz = new MusicBrainzService();

/**
 * GET /api/discs
 * List all discs with optional search and pagination
 */
router.get('/discs', (req, res) => {
  try {
    const { search, sort, limit, offset } = req.query;

    const result = db.getDiscs({
      search,
      sort,
      limit: limit ? parseInt(limit) : 300,
      offset: offset ? parseInt(offset) : 0
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching discs:', error);
    res.status(500).json({ error: 'Failed to fetch discs' });
  }
});

/**
 * GET /api/discs/:position
 * Get single disc with tracks
 */
router.get('/discs/:position', (req, res) => {
  try {
    const position = parseInt(req.params.position);
    const disc = db.getDisc(position);

    if (!disc) {
      return res.status(404).json({ error: 'Disc not found' });
    }

    res.json(disc);
  } catch (error) {
    console.error('Error fetching disc:', error);
    res.status(500).json({ error: 'Failed to fetch disc' });
  }
});

/**
 * POST /api/discs/:position
 * Update disc metadata
 */
router.post('/discs/:position', (req, res) => {
  try {
    const position = parseInt(req.params.position);
    const data = req.body;

    db.upsertDisc(position, data);

    // If tracks provided, update them
    if (data.tracks && Array.isArray(data.tracks)) {
      db.setTracks(position, data.tracks);
    }

    const updated = db.getDisc(position);
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
    const { disc, track, state } = req.body;

    if (!disc || !track || !state) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    db.updatePlaybackState(disc, track, state);

    // Broadcast to WebSocket clients
    if (req.app.get('io')) {
      const playbackState = db.getPlaybackState();
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
    const { disc, track } = req.body;

    if (!disc) {
      return res.status(400).json({ error: 'Disc number required' });
    }

    const cmd = db.queueCommand('play', disc, track || 1);
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
 * POST /api/enrich/:position
 * Enrich disc with MusicBrainz data
 */
router.post('/enrich/:position', async (req, res) => {
  try {
    const position = parseInt(req.params.position);
    const { musicbrainzId } = req.body;

    // Get current disc info
    const disc = db.getDisc(position);
    if (!disc) {
      return res.status(404).json({ error: 'Disc not found' });
    }

    // Enrich with MusicBrainz
    const metadata = await musicbrainz.enrichDisc(
      position,
      disc.artist,
      disc.album,
      musicbrainzId
    );

    // Update database
    db.upsertDisc(position, metadata);
    if (metadata.tracks) {
      db.setTracks(position, metadata.tracks);
    }

    // Broadcast update to WebSocket clients
    if (req.app.get('io')) {
      req.app.get('io').emit('metadata_updated', { position, metadata });
    }

    const updated = db.getDisc(position);
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
