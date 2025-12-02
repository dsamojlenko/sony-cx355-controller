const Database = require('better-sqlite3');
const path = require('path');

/**
 * Database schema initialization
 */
class DatabaseSchema {
  constructor(dbPath = path.join(__dirname, '../../data/jukebox.db')) {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize database connection and create tables
   */
  init() {
    const fs = require('fs');
    const dir = path.dirname(this.dbPath);

    // Create data directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance for concurrent access

    this.createTables();
    return this.db;
  }

  /**
   * Create all database tables
   */
  createTables() {
    // Discs table - stores CD metadata
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS discs (
        position INTEGER PRIMARY KEY,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        musicbrainz_id TEXT,
        year INTEGER,
        cover_art_path TEXT,
        genre TEXT,
        duration_seconds INTEGER,
        track_count INTEGER,
        last_played DATETIME,
        play_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tracks table - stores individual track information
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        disc_position INTEGER NOT NULL,
        track_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        duration_seconds INTEGER,
        FOREIGN KEY (disc_position) REFERENCES discs(position) ON DELETE CASCADE,
        UNIQUE(disc_position, track_number)
      );
    `);

    // Playback state table - single row for current playback status
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS playback_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_disc INTEGER,
        current_track INTEGER,
        state TEXT CHECK(state IN ('play', 'pause', 'stop')) DEFAULT 'stop',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_disc) REFERENCES discs(position)
      );
    `);

    // Command queue table - stores pending commands for ESP32
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_queue (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        disc INTEGER,
        track INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        acknowledged INTEGER DEFAULT 0
      );
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_discs_artist ON discs(artist);
      CREATE INDEX IF NOT EXISTS idx_discs_album ON discs(album);
      CREATE INDEX IF NOT EXISTS idx_discs_last_played ON discs(last_played DESC);
      CREATE INDEX IF NOT EXISTS idx_tracks_disc ON tracks(disc_position);
      CREATE INDEX IF NOT EXISTS idx_command_queue_ack ON command_queue(acknowledged);
    `);

    // Initialize playback state with a single row
    this.db.exec(`
      INSERT OR IGNORE INTO playback_state (id, state) VALUES (1, 'stop');
    `);

    console.log('✓ Database schema initialized');
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = DatabaseSchema;
