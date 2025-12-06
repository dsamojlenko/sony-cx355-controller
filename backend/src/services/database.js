const DatabaseSchema = require('../db/schema');

/**
 * Database service for disc and playback operations
 */
class DatabaseService {
  constructor() {
    this.schema = new DatabaseSchema();
    this.db = this.schema.init();
  }

  /**
   * Get all discs with optional filtering and pagination
   */
  getDiscs({ player = null, search = '', sort = 'position', limit = 600, offset = 0 } = {}) {
    let query = `
      SELECT
        id, player, position, artist, album, year, genre, cover_art_path,
        musicbrainz_id, track_count, play_count, last_played, medium_position
      FROM discs
      WHERE 1=1
    `;

    const params = [];

    // Filter by player
    if (player) {
      query += ` AND player = ?`;
      params.push(player);
    }

    // Add search filter
    if (search) {
      query += ` AND (artist LIKE ? OR album LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    // Add sorting
    const sortColumn = {
      'position': 'player, position',
      'artist': 'artist',
      'album': 'album',
      'lastPlayed': 'last_played DESC',
      'playCount': 'play_count DESC'
    }[sort] || 'player, position';

    query += ` ORDER BY ${sortColumn}`;

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const discs = this.db.prepare(query).all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM discs WHERE 1=1';
    const countParams = [];
    if (player) {
      countQuery += ` AND player = ?`;
      countParams.push(player);
    }
    if (search) {
      countQuery += ` AND (artist LIKE ? OR album LIKE ?)`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern);
    }
    const { total } = this.db.prepare(countQuery).get(...countParams);

    return { discs, total };
  }

  /**
   * Get single disc with tracks by player and position
   */
  getDisc(player, position) {
    const disc = this.db.prepare(`
      SELECT * FROM discs WHERE player = ? AND position = ?
    `).get(player, position);

    if (!disc) {
      return null;
    }

    const tracks = this.db.prepare(`
      SELECT track_number, title, duration_seconds
      FROM tracks
      WHERE disc_id = ?
      ORDER BY track_number
    `).all(disc.id);

    return { ...disc, tracks };
  }

  /**
   * Get single disc by ID
   */
  getDiscById(id) {
    const disc = this.db.prepare(`
      SELECT * FROM discs WHERE id = ?
    `).get(id);

    if (!disc) {
      return null;
    }

    const tracks = this.db.prepare(`
      SELECT track_number, title, duration_seconds
      FROM tracks
      WHERE disc_id = ?
      ORDER BY track_number
    `).all(id);

    return { ...disc, tracks };
  }

  /**
   * Insert or update disc
   */
  upsertDisc(player, position, data) {
    const stmt = this.db.prepare(`
      INSERT INTO discs (
        player, position, artist, album, musicbrainz_id, year, genre,
        cover_art_path, track_count, duration_seconds, medium_position, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(player, position) DO UPDATE SET
        artist = excluded.artist,
        album = excluded.album,
        musicbrainz_id = excluded.musicbrainz_id,
        year = excluded.year,
        genre = excluded.genre,
        cover_art_path = excluded.cover_art_path,
        track_count = excluded.track_count,
        duration_seconds = excluded.duration_seconds,
        medium_position = excluded.medium_position,
        updated_at = CURRENT_TIMESTAMP
    `);

    return stmt.run(
      player,
      position,
      data.artist,
      data.album,
      data.musicbrainz_id || null,
      data.year || null,
      data.genre || null,
      data.cover_art_path || null,
      data.track_count || null,
      data.duration_seconds || null,
      data.medium_position || 1
    );
  }

  /**
   * Insert tracks for a disc (replaces existing)
   */
  setTracks(discId, tracks) {
    const deleteTracks = this.db.prepare('DELETE FROM tracks WHERE disc_id = ?');
    const insertTrack = this.db.prepare(`
      INSERT INTO tracks (disc_id, track_number, title, duration_seconds)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((id, trackList) => {
      deleteTracks.run(id);
      for (const track of trackList) {
        insertTrack.run(
          id,
          track.track_number,
          track.title,
          track.duration_seconds || null
        );
      }
    });

    transaction(discId, tracks);

    // Update track count on disc
    this.db.prepare('UPDATE discs SET track_count = ? WHERE id = ?')
      .run(tracks.length, discId);
  }

  /**
   * Get current playback state
   */
  getPlaybackState() {
    const state = this.db.prepare(`
      SELECT
        ps.current_player,
        ps.current_disc,
        ps.current_track,
        ps.state,
        ps.updated_at,
        d.artist,
        d.album,
        d.year,
        d.cover_art_path,
        t.title as track_title,
        t.duration_seconds as track_duration
      FROM playback_state ps
      LEFT JOIN discs d ON ps.current_player = d.player AND ps.current_disc = d.position
      LEFT JOIN tracks t ON d.id = t.disc_id AND ps.current_track = t.track_number
      WHERE ps.id = 1
    `).get();

    return state;
  }

  /**
   * Update playback state
   */
  updatePlaybackState(player, disc, track, state) {
    // Get current state before updating
    const currentState = this.db.prepare(`
      SELECT current_player, current_disc, current_track, state
      FROM playback_state WHERE id = 1
    `).get();

    const stmt = this.db.prepare(`
      UPDATE playback_state
      SET current_player = ?, current_disc = ?, current_track = ?, state = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    stmt.run(player, disc, track, state);

    // Record track play when track changes and state is 'play'
    if (player && disc && track && state === 'play') {
      const trackChanged = !currentState ||
        currentState.current_player !== player ||
        currentState.current_disc !== disc ||
        currentState.current_track !== track;

      if (trackChanged) {
        this.recordTrackPlay(player, disc, track);
      }
    }
  }

  /**
   * Record a track play event
   */
  recordTrackPlay(player, disc, track) {
    const discRecord = this.db.prepare(`
      SELECT id FROM discs WHERE player = ? AND position = ?
    `).get(player, disc);

    if (discRecord) {
      this.db.prepare(`
        INSERT INTO track_plays (disc_id, track_number, played_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(discRecord.id, track);

      // Update last_played on the disc
      this.db.prepare(`
        UPDATE discs SET last_played = CURRENT_TIMESTAMP WHERE id = ?
      `).run(discRecord.id);
    }
  }

  /**
   * Get track play counts for a disc
   */
  getTrackPlayCounts(discId) {
    return this.db.prepare(`
      SELECT track_number, COUNT(*) as play_count
      FROM track_plays
      WHERE disc_id = ?
      GROUP BY track_number
      ORDER BY track_number
    `).all(discId);
  }

  /**
   * Calculate album play count (minimum plays across all tracks)
   * Returns 0 if not all tracks have been played at least once
   */
  getAlbumPlayCount(discId) {
    const disc = this.db.prepare(`
      SELECT track_count FROM discs WHERE id = ?
    `).get(discId);

    if (!disc || !disc.track_count) {
      return 0;
    }

    const trackPlays = this.getTrackPlayCounts(discId);

    // If we haven't played all tracks, album play count is 0
    if (trackPlays.length < disc.track_count) {
      return 0;
    }

    // Album plays = minimum play count across all tracks
    return Math.min(...trackPlays.map(t => t.play_count));
  }

  /**
   * Get total track plays for a disc
   */
  getTotalTrackPlays(discId) {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM track_plays WHERE disc_id = ?
    `).get(discId);
    return result.count;
  }

  /**
   * Add command to queue
   */
  queueCommand(command, player = null, disc = null, track = null) {
    const id = `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    this.db.prepare(`
      INSERT INTO command_queue (id, command, player, disc, track)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, command, player, disc, track);

    return { id, command, player, disc, track };
  }

  /**
   * Get pending command (for ESP32 polling)
   */
  getPendingCommand() {
    const cmd = this.db.prepare(`
      SELECT id, command, player, disc, track, created_at
      FROM command_queue
      WHERE acknowledged = 0
      ORDER BY created_at ASC
      LIMIT 1
    `).get();

    // Map command field to action for ESP32 compatibility
    if (cmd) {
      return {
        id: cmd.id,
        action: cmd.command,
        player: cmd.player,
        disc: cmd.disc,
        track: cmd.track
      };
    }
    return null;
  }

  /**
   * Acknowledge command
   */
  acknowledgeCommand(id) {
    this.db.prepare(`
      UPDATE command_queue
      SET acknowledged = 1
      WHERE id = ?
    `).run(id);
  }

  /**
   * Clean up old acknowledged commands (older than 1 hour)
   */
  cleanupCommands() {
    this.db.prepare(`
      DELETE FROM command_queue
      WHERE acknowledged = 1
      AND datetime(created_at) < datetime('now', '-1 hour')
    `).run();
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalDiscs = this.db.prepare('SELECT COUNT(*) as count FROM discs').get().count;
    const player1Discs = this.db.prepare('SELECT COUNT(*) as count FROM discs WHERE player = 1').get().count;
    const player2Discs = this.db.prepare('SELECT COUNT(*) as count FROM discs WHERE player = 2').get().count;
    const totalTrackPlays = this.db.prepare('SELECT COUNT(*) as count FROM track_plays').get().count || 0;

    // Get most played albums (by track plays)
    const mostPlayedAlbums = this.db.prepare(`
      SELECT d.id, d.player, d.position, d.artist, d.album, d.track_count, d.cover_art_path,
             COUNT(tp.id) as total_track_plays
      FROM discs d
      JOIN track_plays tp ON d.id = tp.disc_id
      GROUP BY d.id
      ORDER BY total_track_plays DESC
      LIMIT 10
    `).all().map(disc => ({
      ...disc,
      album_plays: this.getAlbumPlayCount(disc.id),
      total_track_plays: disc.total_track_plays
    }));

    // Get most played individual tracks
    const mostPlayedTracks = this.db.prepare(`
      SELECT d.player, d.position, d.artist, d.album,
             tp.track_number, t.title as track_title,
             COUNT(tp.id) as play_count
      FROM track_plays tp
      JOIN discs d ON tp.disc_id = d.id
      LEFT JOIN tracks t ON d.id = t.disc_id AND tp.track_number = t.track_number
      GROUP BY tp.disc_id, tp.track_number
      ORDER BY play_count DESC
      LIMIT 10
    `).all();

    const recentlyPlayed = this.db.prepare(`
      SELECT d.player, d.position, d.artist, d.album, d.cover_art_path, d.last_played
      FROM discs d
      WHERE d.last_played IS NOT NULL
      ORDER BY d.last_played DESC
      LIMIT 10
    `).all();

    return {
      totalDiscs,
      player1Discs,
      player2Discs,
      totalTrackPlays,
      mostPlayedAlbums,
      mostPlayedTracks,
      recentlyPlayed
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.schema.close();
  }
}

module.exports = DatabaseService;
