import type {
  Disc,
  DiscWithTracks,
  DiscsResponse,
  PlaybackState,
  StatsResponse,
  CommandResponse,
  PlayerFilter,
  MusicBrainzRelease,
} from '@/types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Disc endpoints
export async function getDiscs(params?: {
  player?: PlayerFilter;
  search?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<DiscsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.player && params.player !== 'all') {
    searchParams.set('player', String(params.player));
  }
  if (params?.search) {
    searchParams.set('search', params.search);
  }
  if (params?.sort) {
    searchParams.set('sort', params.sort);
  }
  if (params?.limit) {
    searchParams.set('limit', String(params.limit));
  }
  if (params?.offset) {
    searchParams.set('offset', String(params.offset));
  }

  const query = searchParams.toString();
  return fetchJson<DiscsResponse>(`${API_BASE}/discs${query ? `?${query}` : ''}`);
}

export async function getDisc(player: number, position: number): Promise<DiscWithTracks> {
  return fetchJson<DiscWithTracks>(`${API_BASE}/discs/${player}/${position}`);
}

export async function updateDisc(
  player: number,
  position: number,
  data: Partial<Disc>
): Promise<Disc> {
  return fetchJson<Disc>(`${API_BASE}/discs/${player}/${position}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Playback state
export async function getCurrentState(): Promise<PlaybackState> {
  return fetchJson<PlaybackState>(`${API_BASE}/current`);
}

// Control commands
export async function play(player: number, disc: number, track?: number): Promise<CommandResponse> {
  return fetchJson<CommandResponse>(`${API_BASE}/control/play`, {
    method: 'POST',
    body: JSON.stringify({ player, disc, track }),
  });
}

export async function pause(): Promise<CommandResponse> {
  return fetchJson<CommandResponse>(`${API_BASE}/control/pause`, {
    method: 'POST',
  });
}

export async function stop(): Promise<CommandResponse> {
  return fetchJson<CommandResponse>(`${API_BASE}/control/stop`, {
    method: 'POST',
  });
}

export async function nextTrack(): Promise<CommandResponse> {
  return fetchJson<CommandResponse>(`${API_BASE}/control/next`, {
    method: 'POST',
  });
}

export async function previousTrack(): Promise<CommandResponse> {
  return fetchJson<CommandResponse>(`${API_BASE}/control/previous`, {
    method: 'POST',
  });
}

// Stats
export async function getStats(): Promise<StatsResponse> {
  return fetchJson<StatsResponse>(`${API_BASE}/stats`);
}

// Enrichment
export async function enrichDisc(
  player: number,
  position: number,
  musicbrainzId?: string
): Promise<Disc> {
  return fetchJson<Disc>(`${API_BASE}/enrich/${player}/${position}`, {
    method: 'POST',
    body: JSON.stringify({ musicbrainzId }),
  });
}

// MusicBrainz search
export async function searchMusicBrainz(
  artist: string,
  album: string
): Promise<MusicBrainzRelease[]> {
  const params = new URLSearchParams({ artist, album });
  return fetchJson<MusicBrainzRelease[]>(`${API_BASE}/search/musicbrainz?${params}`);
}
