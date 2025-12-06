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
    // player: 1 or 2 (physical player unit)
    // position: 1-300 (slot number within that player)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS discs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player INTEGER NOT NULL DEFAULT 1 CHECK(player IN (1, 2)),
        position INTEGER NOT NULL CHECK(position >= 1 AND position <= 300),
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player, position)
      );
    `);

    // Tracks table - stores individual track information
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        disc_id INTEGER NOT NULL,
        track_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        duration_seconds INTEGER,
        FOREIGN KEY (disc_id) REFERENCES discs(id) ON DELETE CASCADE,
        UNIQUE(disc_id, track_number)
      );
    `);

    // Playback state table - single row for current playback status
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS playback_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_player INTEGER CHECK(current_player IN (1, 2)),
        current_disc INTEGER,
        current_track INTEGER,
        state TEXT CHECK(state IN ('play', 'pause', 'stop')) DEFAULT 'stop',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Command queue table - stores pending commands for ESP32
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_queue (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        player INTEGER,
        disc INTEGER,
        track INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        acknowledged INTEGER DEFAULT 0
      );
    `);

    // Track plays table - records individual track play events
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS track_plays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        disc_id INTEGER NOT NULL,
        track_number INTEGER NOT NULL,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (disc_id) REFERENCES discs(id) ON DELETE CASCADE
      );
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_discs_player ON discs(player);
      CREATE INDEX IF NOT EXISTS idx_discs_artist ON discs(artist);
      CREATE INDEX IF NOT EXISTS idx_discs_album ON discs(album);
      CREATE INDEX IF NOT EXISTS idx_discs_last_played ON discs(last_played DESC);
      CREATE INDEX IF NOT EXISTS idx_tracks_disc ON tracks(disc_id);
      CREATE INDEX IF NOT EXISTS idx_command_queue_ack ON command_queue(acknowledged);
      CREATE INDEX IF NOT EXISTS idx_track_plays_disc ON track_plays(disc_id);
      CREATE INDEX IF NOT EXISTS idx_track_plays_disc_track ON track_plays(disc_id, track_number);
    `);

    // Initialize playback state with a single row
    this.db.exec(`
      INSERT OR IGNORE INTO playback_state (id, state) VALUES (1, 'stop');
    `);

    // Migration: Add medium_position column if it doesn't exist
    try {
      this.db.exec('ALTER TABLE discs ADD COLUMN medium_position INTEGER DEFAULT 1');
      console.log('✓ Added medium_position column to discs table');
    } catch (e) {
      // Column already exists, ignore
    }

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
