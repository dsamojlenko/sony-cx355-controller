export interface Disc {
  id: number;
  player: 1 | 2;
  position: number;
  artist: string;
  album: string;
  musicbrainz_id?: string;
  year?: number;
  genre?: string;
  cover_art_path?: string;
  track_count?: number;
  duration_seconds?: number;
  medium_position?: number;
  play_count: number;
  last_played?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Track {
  id?: number;
  disc_id?: number;
  track_number: number;
  title: string;
  duration_seconds?: number;
}

export interface DiscWithTracks extends Disc {
  tracks: Track[];
}

export type PlaybackStateValue = 'play' | 'pause' | 'stop' | 'loading' | null;

export interface PlaybackState {
  current_player: 1 | 2 | null;
  current_disc: number | null;
  current_track: number | null;
  state: PlaybackStateValue;
  updated_at?: string;
  // Joined metadata from disc
  artist?: string;
  album?: string;
  year?: number;
  cover_art_path?: string;
  track_title?: string;
  track_duration?: number;
}

export interface DiscsResponse {
  discs: Disc[];
  total: number;
}

export interface StatsResponse {
  totalDiscs: number;
  player1Discs: number;
  player2Discs: number;
  totalPlays: number;
  mostPlayed: Disc[];
  recentlyPlayed: Disc[];
}

export interface CommandResponse {
  success: boolean;
  queued?: boolean;
  commandId?: string;
  error?: string;
}

export interface PollResponse {
  id?: string;
  action?: string;
  player?: number;
  disc?: number;
  track?: number;
}

export type PlayerFilter = 'all' | 1 | 2;

export interface MusicBrainzRelease {
  id: string;
  title: string;
  artist: string;
  date: string;
  country: string;
  label: string;
  format: string;
  mediaCount: number;
  coverArtUrl: string;
}
