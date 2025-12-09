/**
 * Scrobble Manager - handles timing logic for Last.fm scrobbles
 *
 * Sends "Now Playing" immediately when a track starts, then schedules
 * the actual scrobble for after 50% of the track duration (or 4 minutes,
 * whichever is less).
 */
class ScrobbleManager {
  constructor(lastfmService, database) {
    this.lastfm = lastfmService;
    this.db = database;
    this.pendingTimer = null;
    this.pendingTrack = null;
  }

  /**
   * Called when a new track starts playing
   * @param {number} player - Player number (1 or 2)
   * @param {number} disc - Disc position (1-300)
   * @param {number} track - Track number
   */
  async onTrackStart(player, disc, track) {
    // Cancel any pending scrobble
    this._cancelPendingScrobble();

    // Check if Last.fm is configured and authenticated
    if (!this.lastfm || !this.lastfm.isConfigured() || !this.lastfm.isAuthenticated()) {
      return;
    }

    // Get track metadata from database
    const trackInfo = this._getTrackInfo(player, disc, track);
    if (!trackInfo) {
      console.warn(`[Scrobble] No metadata for P${player} disc ${disc} track ${track}`);
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Store pending track info for the delayed scrobble
    this.pendingTrack = {
      player,
      disc,
      track,
      timestamp,
      ...trackInfo
    };

    // Send "Now Playing" immediately
    try {
      await this.lastfm.updateNowPlaying({
        artist: trackInfo.artist,
        track: trackInfo.title,
        album: trackInfo.album,
        duration: trackInfo.duration
      });
    } catch (error) {
      console.error('[Scrobble] Now Playing failed:', error.message);
      // Continue anyway - we still want to try scrobbling
    }

    // Schedule the scrobble
    // Per Last.fm rules: scrobble after 50% of track or 4 minutes, whichever is less
    const duration = trackInfo.duration || 180; // Default to 3 min if unknown
    const scrobbleDelay = Math.min(Math.floor(duration * 0.5), 240);

    console.log(`[Scrobble] Scheduled for ${scrobbleDelay}s: ${trackInfo.artist} - ${trackInfo.title}`);

    this.pendingTimer = setTimeout(() => {
      this._executeScrobble();
    }, scrobbleDelay * 1000);
  }

  /**
   * Called when playback stops or pauses
   * Cancels any pending scrobble since the track wasn't fully played
   */
  onPlaybackStopped() {
    if (this.pendingTrack) {
      console.log(`[Scrobble] Cancelled (playback stopped): ${this.pendingTrack.artist} - ${this.pendingTrack.title}`);
    }
    this._cancelPendingScrobble();
  }

  /**
   * Get track metadata from database
   * @private
   */
  _getTrackInfo(player, disc, trackNumber) {
    // Get disc info
    const discRecord = this.db.db.prepare(`
      SELECT id, artist, album FROM discs WHERE player = ? AND position = ?
    `).get(player, disc);

    if (!discRecord) {
      return null;
    }

    // Get track info (including track-level artist for compilations)
    const trackRecord = this.db.db.prepare(`
      SELECT title, duration_seconds, artist FROM tracks WHERE disc_id = ? AND track_number = ?
    `).get(discRecord.id, trackNumber);

    if (!trackRecord || !trackRecord.title) {
      // Fall back to disc info without track title
      return {
        artist: discRecord.artist,
        album: discRecord.album,
        title: `Track ${trackNumber}`,
        duration: null
      };
    }

    // Use track-level artist if available, otherwise fall back to disc artist
    const artist = trackRecord.artist || discRecord.artist;

    return {
      artist: artist,
      album: discRecord.album,
      title: trackRecord.title,
      duration: trackRecord.duration_seconds
    };
  }

  /**
   * Execute the pending scrobble
   * @private
   */
  async _executeScrobble() {
    if (!this.pendingTrack) {
      return;
    }

    const track = this.pendingTrack;
    this.pendingTrack = null;
    this.pendingTimer = null;

    try {
      await this.lastfm.scrobble({
        artist: track.artist,
        track: track.title,
        album: track.album,
        timestamp: track.timestamp,
        duration: track.duration,
        trackNumber: track.track
      });
    } catch (error) {
      console.error('[Scrobble] Failed:', error.message);
    }
  }

  /**
   * Cancel any pending scrobble timer
   * @private
   */
  _cancelPendingScrobble() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.pendingTrack = null;
  }
}

module.exports = ScrobbleManager;
