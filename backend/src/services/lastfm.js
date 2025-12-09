const axios = require('axios');
const crypto = require('crypto');

/**
 * Last.fm API service for scrobbling and Now Playing updates
 */
class LastFmService {
  constructor(apiKey, apiSecret, sessionKey = null) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.sessionKey = sessionKey;
    this.baseURL = 'https://ws.audioscrobbler.com/2.0/';
  }

  /**
   * Check if service is configured with API credentials
   */
  isConfigured() {
    return !!(this.apiKey && this.apiSecret);
  }

  /**
   * Check if user is authenticated (has session key)
   */
  isAuthenticated() {
    return !!(this.sessionKey);
  }

  /**
   * Set session key (after successful auth)
   */
  setSessionKey(sessionKey) {
    this.sessionKey = sessionKey;
  }

  /**
   * Generate Last.fm auth URL for user to visit
   * @param {string} callbackUrl - URL to redirect after auth
   */
  getAuthUrl(callbackUrl) {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      cb: callbackUrl
    });
    return `https://www.last.fm/api/auth/?${params.toString()}`;
  }

  /**
   * Exchange auth token for session key
   * @param {string} token - Token from callback URL
   * @returns {Promise<{session: {name: string, key: string}}>}
   */
  async getSession(token) {
    const params = {
      method: 'auth.getSession',
      api_key: this.apiKey,
      token: token
    };

    const response = await this._makeSignedRequest(params, false);
    return response.session;
  }

  /**
   * Update "Now Playing" status on Last.fm
   * @param {Object} track - Track info
   * @param {string} track.artist - Artist name
   * @param {string} track.track - Track title
   * @param {string} [track.album] - Album name
   * @param {number} [track.duration] - Track duration in seconds
   */
  async updateNowPlaying({ artist, track, album, duration }) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated with Last.fm');
    }

    const params = {
      method: 'track.updateNowPlaying',
      api_key: this.apiKey,
      sk: this.sessionKey,
      artist: artist,
      track: track
    };

    if (album) params.album = album;
    if (duration) params.duration = duration;

    const response = await this._makeSignedRequest(params, true);
    console.log(`[Last.fm] Now Playing: ${artist} - ${track}`);
    return response;
  }

  /**
   * Scrobble a track to Last.fm
   * @param {Object} track - Track info
   * @param {string} track.artist - Artist name
   * @param {string} track.track - Track title
   * @param {number} track.timestamp - Unix timestamp when track started playing
   * @param {string} [track.album] - Album name
   * @param {number} [track.duration] - Track duration in seconds
   * @param {number} [track.trackNumber] - Track position on album
   */
  async scrobble({ artist, track, timestamp, album, duration, trackNumber }) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated with Last.fm');
    }

    const params = {
      method: 'track.scrobble',
      api_key: this.apiKey,
      sk: this.sessionKey,
      'artist[0]': artist,
      'track[0]': track,
      'timestamp[0]': timestamp
    };

    if (album) params['album[0]'] = album;
    if (duration) params['duration[0]'] = duration;
    if (trackNumber) params['trackNumber[0]'] = trackNumber;

    const response = await this._makeSignedRequest(params, true);
    console.log(`[Last.fm] Scrobble response:`, JSON.stringify(response, null, 2));
    console.log(`[Last.fm] Scrobbled: ${artist} - ${track}`);
    return response;
  }

  /**
   * Generate API signature for signed requests
   * @param {Object} params - Request parameters
   * @returns {string} MD5 signature
   */
  _generateSignature(params) {
    // Sort parameters alphabetically by key
    const sortedKeys = Object.keys(params).sort();

    // Concatenate key-value pairs
    let sigString = '';
    for (const key of sortedKeys) {
      sigString += key + params[key];
    }

    // Append secret and hash
    sigString += this.apiSecret;
    return crypto.createHash('md5').update(sigString, 'utf8').digest('hex');
  }

  /**
   * Make a signed request to Last.fm API
   * @param {Object} params - Request parameters
   * @param {boolean} requiresAuth - Whether request requires session key
   * @returns {Promise<Object>} API response
   */
  async _makeSignedRequest(params, requiresAuth = false) {
    if (requiresAuth && !this.sessionKey) {
      throw new Error('Session key required for this request');
    }

    // Add signature
    const signature = this._generateSignature(params);

    // Build form data
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      formData.append(key, value);
    }
    formData.append('api_sig', signature);
    formData.append('format', 'json');

    try {
      console.log(`[Last.fm] Request: ${params.method}`, Object.fromEntries(
        Object.entries(params).filter(([k]) => k !== 'api_key' && k !== 'sk')
      ));

      const response = await axios.post(this.baseURL, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Check for API errors
      if (response.data.error) {
        const error = new Error(response.data.message || 'Last.fm API error');
        error.code = response.data.error;
        throw error;
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        console.error('[Last.fm] API error:', error.response.data);
      } else {
        console.error('[Last.fm] Request error:', error.message);
      }
      throw error;
    }
  }
}

module.exports = LastFmService;
