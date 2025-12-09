const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * MusicBrainz API service for fetching album metadata
 */
class MusicBrainzService {
  constructor() {
    this.baseURL = 'https://musicbrainz.org/ws/2';
    this.coverArtURL = 'https://coverartarchive.org';
    this.userAgent = 'CDJukebox/1.0.0 (https://github.com/dsamojlenko/sony-cx355-display)';
    this.rateLimitMs = 1100; // 1 request per second per MusicBrainz guidelines (with buffer)
    this.lastRequest = 0;
    this.coverDir = path.join(__dirname, '../../public/covers');

    // Create cover art directory if it doesn't exist
    if (!fs.existsSync(this.coverDir)) {
      fs.mkdirSync(this.coverDir, { recursive: true });
    }
  }

  /**
   * Rate limiting to respect MusicBrainz API guidelines
   */
  async _waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;

    if (timeSinceLastRequest < this.rateLimitMs) {
      await new Promise(resolve =>
        setTimeout(resolve, this.rateLimitMs - timeSinceLastRequest)
      );
    }

    this.lastRequest = Date.now();
  }

  /**
   * Search for releases by artist and album
   */
  async searchRelease(artist, album) {
    await this._waitForRateLimit();

    try {
      const query = `artist:"${artist}" AND release:"${album}"`;
      const response = await axios.get(`${this.baseURL}/release`, {
        params: {
          query,
          fmt: 'json',
          limit: 5
        },
        headers: {
          'User-Agent': this.userAgent
        }
      });

      return response.data.releases || [];
    } catch (error) {
      console.error('MusicBrainz search error:', error.message);
      throw error;
    }
  }

  /**
   * Get detailed release information including tracks
   * @param {string} releaseId - MusicBrainz release ID
   * @param {number} mediumPosition - Which disc of a multi-disc set (1-indexed, default 1)
   */
  async getRelease(releaseId, mediumPosition = 1) {
    await this._waitForRateLimit();

    try {
      const response = await axios.get(`${this.baseURL}/release/${releaseId}`, {
        params: {
          inc: 'recordings+artist-credits+labels',
          fmt: 'json'
        },
        headers: {
          'User-Agent': this.userAgent
        }
      });

      const release = response.data;
      const mediaCount = release.media ? release.media.length : 1;

      // Parse track information from the specified medium (disc)
      const tracks = [];
      const mediaIndex = mediumPosition - 1;
      const medium = release.media && release.media[mediaIndex];

      // Get the release-level artist for comparison
      const releaseArtist = release['artist-credit'] && release['artist-credit'][0]
        ? release['artist-credit'][0].name
        : null;

      if (medium && medium.tracks) {
        medium.tracks.forEach((track, index) => {
          // Extract track-level artist from the recording's artist-credit
          let trackArtist = null;
          if (track.recording && track.recording['artist-credit'] && track.recording['artist-credit'].length > 0) {
            // Join all artist credits (handles "Artist A feat. Artist B" cases)
            trackArtist = track.recording['artist-credit']
              .map(credit => credit.name + (credit.joinphrase || ''))
              .join('');
          }

          // Only store track artist if it differs from the release artist
          // This keeps the data clean for non-compilation albums
          const artistToStore = (trackArtist && trackArtist !== releaseArtist) ? trackArtist : null;

          tracks.push({
            track_number: index + 1,
            title: track.title,
            duration_seconds: track.length ? Math.round(track.length / 1000) : null,
            artist: artistToStore
          });
        });
      }

      // Extract relevant metadata
      const metadata = {
        musicbrainz_id: release.id,
        artist: release['artist-credit'] && release['artist-credit'][0]
          ? release['artist-credit'][0].name
          : null,
        album: release.title,
        year: release.date ? parseInt(release.date.split('-')[0]) : null,
        track_count: tracks.length,
        duration_seconds: tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0),
        medium_position: mediumPosition,
        media_count: mediaCount,
        tracks
      };

      return metadata;
    } catch (error) {
      console.error('MusicBrainz release fetch error:', error.message);
      throw error;
    }
  }

  /**
   * Download cover art for a release
   * @param {string} releaseId - MusicBrainz release ID
   * @param {number} player - Player number (1 or 2)
   * @param {number} position - Disc position (1-300)
   */
  async downloadCoverArt(releaseId, player, position) {
    try {
      const filename = `p${player}-${position}.jpg`;
      const coverPath = path.join(this.coverDir, filename);

      // Check if cover already exists
      if (fs.existsSync(coverPath)) {
        console.log(`Cover art already exists for P${player}-${position}`);
        return `/covers/${filename}`;
      }

      // Fetch cover art from Cover Art Archive
      const response = await axios.get(
        `${this.coverArtURL}/release/${releaseId}/front-500.jpg`,
        {
          responseType: 'arraybuffer',
          timeout: 10000
        }
      );

      // Save to file
      fs.writeFileSync(coverPath, response.data);
      console.log(`✓ Downloaded cover art for P${player}-${position}`);

      return `/covers/${filename}`;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.warn(`No cover art available for release ${releaseId}`);
      } else {
        console.error('Cover art download error:', error.message);
      }
      return null;
    }
  }

  /**
   * Enrich disc with MusicBrainz metadata
   *
   * @param {number} player - Player number (1 or 2)
   * @param {number} position - Disc position (1-300)
   * @param {string} artist - Artist name
   * @param {string} album - Album name
   * @param {string} releaseId - Optional: specific MusicBrainz release ID
   * @param {number} mediumPosition - Which disc of a multi-disc set (1-indexed, default 1)
   */
  async enrichDisc(player, position, artist, album, releaseId = null, mediumPosition = 1) {
    try {
      let mbid = releaseId;

      // If no release ID provided, search for it
      if (!mbid) {
        console.log(`[MusicBrainz] Searching for: ${artist} - ${album}`);
        const results = await this.searchRelease(artist, album);

        if (results.length === 0) {
          throw new Error('No releases found');
        }

        // Use first result (could implement better matching logic)
        mbid = results[0].id;
        console.log(`[MusicBrainz] Found release: ${results[0].title} (${results[0].id})`);
      }

      // Get detailed release information
      console.log(`[MusicBrainz] Fetching release details for ${mbid} (disc ${mediumPosition})...`);
      const metadata = await this.getRelease(mbid, mediumPosition);

      // Download cover art
      console.log(`[MusicBrainz] Downloading cover art...`);
      const coverArtPath = await this.downloadCoverArt(mbid, player, position);

      return {
        ...metadata,
        cover_art_path: coverArtPath
      };
    } catch (error) {
      console.error(`[MusicBrainz] Failed to enrich P${player}-${position}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if a disc needs enrichment (missing metadata)
   */
  needsEnrichment(disc) {
    return !disc.musicbrainz_id || !disc.track_count || disc.track_count === 0;
  }

  /**
   * Get suggested releases for manual selection
   */
  async getSuggestions(artist, album) {
    const results = await this.searchRelease(artist, album);

    return results.map(release => {
      // Extract format from media array (e.g., "CD", "Vinyl", "Digital Media")
      const formats = release.media
        ? [...new Set(release.media.map(m => m.format).filter(Boolean))]
        : [];
      const format = formats.length > 0 ? formats.join(' + ') : 'Unknown';
      const mediaCount = release.media ? release.media.length : 1;

      return {
        id: release.id,
        title: release.title,
        artist: release['artist-credit'] && release['artist-credit'][0]
          ? release['artist-credit'][0].name
          : 'Unknown',
        date: release.date || 'Unknown',
        country: release.country || 'Unknown',
        label: release['label-info'] && release['label-info'][0]
          ? release['label-info'][0].label.name
          : 'Unknown',
        format,
        mediaCount,
        // Cover Art Archive thumbnail URL - frontend can try to load this
        coverArtUrl: `https://coverartarchive.org/release/${release.id}/front-250`
      };
    });
  }
}

module.exports = MusicBrainzService;
