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
  getDiscs({ search = '', sort = 'position', limit = 300, offset = 0 } = {}) {
    let query = `
      SELECT
        position, artist, album, year, genre, cover_art_path,
        track_count, play_count, last_played
      FROM discs
      WHERE 1=1
    `;

    const params = [];

    // Add search filter
    if (search) {
      query += ` AND (artist LIKE ? OR album LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    // Add sorting
    const sortColumn = {
      'position': 'position',
      'artist': 'artist',
      'album': 'album',
      'lastPlayed': 'last_played DESC',
      'playCount': 'play_count DESC'
    }[sort] || 'position';

    query += ` ORDER BY ${sortColumn}`;

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const discs = this.db.prepare(query).all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM discs WHERE 1=1';
    const countParams = [];
    if (search) {
      countQuery += ` AND (artist LIKE ? OR album LIKE ?)`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern);
    }
    const { total } = this.db.prepare(countQuery).get(...countParams);

    return { discs, total };
  }

  /**
   * Get single disc with tracks
   */
  getDisc(position) {
    const disc = this.db.prepare(`
      SELECT * FROM discs WHERE position = ?
    `).get(position);

    if (!disc) {
      return null;
    }

    const tracks = this.db.prepare(`
      SELECT track_number, title, duration_seconds
      FROM tracks
      WHERE disc_position = ?
      ORDER BY track_number
    `).all(position);

    return { ...disc, tracks };
  }

  /**
   * Insert or update disc
   */
  upsertDisc(position, data) {
    const stmt = this.db.prepare(`
      INSERT INTO discs (
        position, artist, album, musicbrainz_id, year, genre,
        cover_art_path, track_count, duration_seconds, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(position) DO UPDATE SET
        artist = excluded.artist,
        album = excluded.album,
        musicbrainz_id = excluded.musicbrainz_id,
        year = excluded.year,
        genre = excluded.genre,
        cover_art_path = excluded.cover_art_path,
        track_count = excluded.track_count,
        duration_seconds = excluded.duration_seconds,
        updated_at = CURRENT_TIMESTAMP
    `);

    return stmt.run(
      position,
      data.artist,
      data.album,
      data.musicbrainz_id || null,
      data.year || null,
      data.genre || null,
      data.cover_art_path || null,
      data.track_count || null,
      data.duration_seconds || null
    );
  }

  /**
   * Insert tracks for a disc (replaces existing)
   */
  setTracks(position, tracks) {
    const deleteTracks = this.db.prepare('DELETE FROM tracks WHERE disc_position = ?');
    const insertTrack = this.db.prepare(`
      INSERT INTO tracks (disc_position, track_number, title, duration_seconds)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((discPosition, trackList) => {
      deleteTracks.run(discPosition);
      for (const track of trackList) {
        insertTrack.run(
          discPosition,
          track.track_number,
          track.title,
          track.duration_seconds || null
        );
      }
    });

    transaction(position, tracks);

    // Update track count on disc
    this.db.prepare('UPDATE discs SET track_count = ? WHERE position = ?')
      .run(tracks.length, position);
  }

  /**
   * Get current playback state
   */
  getPlaybackState() {
    const state = this.db.prepare(`
      SELECT
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
      LEFT JOIN discs d ON ps.current_disc = d.position
      LEFT JOIN tracks t ON ps.current_disc = t.disc_position
        AND ps.current_track = t.track_number
      WHERE ps.id = 1
    `).get();

    return state;
  }

  /**
   * Update playback state
   */
  updatePlaybackState(disc, track, state) {
    const stmt = this.db.prepare(`
      UPDATE playback_state
      SET current_disc = ?, current_track = ?, state = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    stmt.run(disc, track, state);

    // Increment play count and update last_played if disc changed
    if (disc && state === 'play') {
      this.db.prepare(`
        UPDATE discs
        SET play_count = play_count + 1,
            last_played = CURRENT_TIMESTAMP
        WHERE position = ?
        AND (last_played IS NULL OR datetime(last_played) < datetime('now', '-1 minute'))
      `).run(disc);
    }
  }

  /**
   * Add command to queue
   */
  queueCommand(command, disc = null, track = null) {
    const id = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO command_queue (id, command, disc, track)
      VALUES (?, ?, ?, ?)
    `).run(id, command, disc, track);

    return { id, command, disc, track };
  }

  /**
   * Get pending command (for ESP32 polling)
   */
  getPendingCommand() {
    return this.db.prepare(`
      SELECT id, command, disc, track, created_at
      FROM command_queue
      WHERE acknowledged = 0
      ORDER BY created_at ASC
      LIMIT 1
    `).get();
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
    const totalPlays = this.db.prepare('SELECT SUM(play_count) as count FROM discs').get().count || 0;
    const mostPlayed = this.db.prepare(`
      SELECT position, artist, album, play_count
      FROM discs
      WHERE play_count > 0
      ORDER BY play_count DESC
      LIMIT 10
    `).all();
    const recentlyPlayed = this.db.prepare(`
      SELECT position, artist, album, last_played
      FROM discs
      WHERE last_played IS NOT NULL
      ORDER BY last_played DESC
      LIMIT 10
    `).all();

    return {
      totalDiscs,
      totalPlays,
      mostPlayed,
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
