import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDiscs } from '@/lib/api';
import { getCoverUrl } from '@/lib/utils';
import { usePlaybackState } from '@/hooks/usePlaybackState';
import { useTrackTimer } from '@/hooks/useTrackTimer';
import type { AnimationStyle } from '@/hooks/useScreensaverSettings';
import type { Disc, PlaybackState } from '@/types';

interface ScreensaverProps {
  isActive: boolean;
  onExit: () => void;
  animationStyle: AnimationStyle;
}

interface FloatingCover {
  disc: Disc;
  x: number;
  y: number;
  size: number;
  animationDelay: number;
  animationDuration: number;
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function Screensaver({ isActive, onExit, animationStyle }: ScreensaverProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const { state: playbackState } = usePlaybackState();
  const nowPlayingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nowPlayingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all discs with cover art
  const { data } = useQuery({
    queryKey: ['discs', { limit: 1000 }],
    queryFn: () => getDiscs({ limit: 1000 }),
    enabled: isActive,
    staleTime: 300000, // 5 minutes
  });

  // Filter discs with cover art and shuffle
  const coversToShow = useMemo(() => {
    if (!data?.discs) return [];
    const withCovers = data.discs.filter(d => d.cover_art_path);
    return shuffleArray(withCovers).slice(0, 30);
  }, [data]);

  // Generate floating cover positions
  const floatingCovers = useMemo((): FloatingCover[] => {
    return coversToShow.slice(0, 18).map((disc) => ({
      disc,
      x: Math.random() * 80 + 5, // 5-85% from left
      y: Math.random() * 70 + 10, // 10-80% from top
      size: Math.random() * 80 + 100, // 100-180px
      animationDelay: Math.random() * 10, // 0-10s delay
      animationDuration: Math.random() * 10 + 20, // 20-30s duration
    }));
  }, [coversToShow]);

  // Ken Burns state
  const [kenBurnsIndex, setKenBurnsIndex] = useState(0);
  const [kenBurnsTransitioning, setKenBurnsTransitioning] = useState(false);

  // Mosaic state
  const [mosaicCovers, setMosaicCovers] = useState<Disc[]>([]);

  // Initialize mosaic
  useEffect(() => {
    if (animationStyle === 'mosaic' && coversToShow.length > 0) {
      setMosaicCovers(coversToShow.slice(0, 25));
    }
  }, [animationStyle, coversToShow]);

  // Ken Burns rotation
  useEffect(() => {
    if (!isActive || animationStyle !== 'kenburns' || coversToShow.length === 0) return;

    const interval = setInterval(() => {
      setKenBurnsTransitioning(true);
      setTimeout(() => {
        setKenBurnsIndex(prev => (prev + 1) % coversToShow.length);
        setKenBurnsTransitioning(false);
      }, 1000);
    }, 12000);

    return () => clearInterval(interval);
  }, [isActive, animationStyle, coversToShow.length]);

  // Mosaic shuffle
  useEffect(() => {
    if (!isActive || animationStyle !== 'mosaic' || coversToShow.length < 25) return;

    const interval = setInterval(() => {
      setMosaicCovers(prev => {
        const newCovers = [...prev];
        // Swap 2-3 random positions
        const swaps = Math.floor(Math.random() * 2) + 2;
        for (let i = 0; i < swaps; i++) {
          const idx = Math.floor(Math.random() * newCovers.length);
          const newDisc = coversToShow[Math.floor(Math.random() * coversToShow.length)];
          newCovers[idx] = newDisc;
        }
        return newCovers;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isActive, animationStyle, coversToShow]);

  // "Now Playing" interruption logic
  useEffect(() => {
    if (!isActive) {
      setShowNowPlaying(false);
      return;
    }

    const isPlaying = playbackState?.state === 'play' && playbackState.cover_art_path;

    if (!isPlaying) {
      setShowNowPlaying(false);
      if (nowPlayingIntervalRef.current) {
        clearInterval(nowPlayingIntervalRef.current);
        nowPlayingIntervalRef.current = null;
      }
      return;
    }

    // Show "Now Playing" every 30-45 seconds for 8 seconds
    const scheduleNowPlaying = () => {
      const delay = Math.random() * 15000 + 30000; // 30-45 seconds
      nowPlayingTimerRef.current = setTimeout(() => {
        setShowNowPlaying(true);
        setTimeout(() => {
          setShowNowPlaying(false);
          scheduleNowPlaying();
        }, 8000);
      }, delay);
    };

    scheduleNowPlaying();

    return () => {
      if (nowPlayingTimerRef.current) {
        clearTimeout(nowPlayingTimerRef.current);
      }
    };
  }, [isActive, playbackState?.state, playbackState?.cover_art_path]);

  // Handle visibility with fade
  useEffect(() => {
    if (isActive) {
      // Small delay before showing to allow data to load
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isActive]);

  // Exit handler with event listeners
  const handleExit = useCallback(() => {
    onExit();
  }, [onExit]);

  useEffect(() => {
    if (!isActive) return;

    // Debounce to prevent immediate exit on activation
    let canExit = false;
    const enableExitTimer = setTimeout(() => {
      canExit = true;
    }, 500);

    const handleInteraction = () => {
      if (canExit) {
        handleExit();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleInteraction, { passive: true });
    });

    return () => {
      clearTimeout(enableExitTimer);
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };
  }, [isActive, handleExit]);

  // Preload images
  useEffect(() => {
    coversToShow.forEach(disc => {
      if (disc.cover_art_path) {
        const img = new Image();
        img.src = getCoverUrl(disc.cover_art_path);
      }
    });
  }, [coversToShow]);

  if (!isActive) return null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black transition-opacity duration-700 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ cursor: 'none' }}
    >
      {/* Main animation content */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          showNowPlaying ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {animationStyle === 'floating' && (
          <FloatingGridAnimation
            covers={floatingCovers}
            reducedMotion={reducedMotion}
          />
        )}

        {animationStyle === 'kenburns' && coversToShow.length > 0 && (
          <KenBurnsAnimation
            disc={coversToShow[kenBurnsIndex]}
            transitioning={kenBurnsTransitioning}
            reducedMotion={reducedMotion}
          />
        )}

        {animationStyle === 'mosaic' && (
          <MosaicAnimation
            covers={mosaicCovers}
            reducedMotion={reducedMotion}
          />
        )}
      </div>

      {/* "Now Playing" overlay */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-1000 ${
          showNowPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {playbackState && showNowPlaying && (
          <NowPlayingDisplay playbackState={playbackState} />
        )}
      </div>
    </div>
  );
}

// Floating Grid Animation
function FloatingGridAnimation({
  covers,
  reducedMotion,
}: {
  covers: FloatingCover[];
  reducedMotion: boolean;
}) {
  return (
    <>
      {covers.map((cover, i) => (
        <div
          key={`${cover.disc.id}-${i}`}
          className="absolute rounded-lg shadow-2xl overflow-hidden"
          style={{
            left: `${cover.x}%`,
            top: `${cover.y}%`,
            width: cover.size,
            height: cover.size,
            animation: reducedMotion
              ? 'none'
              : `screensaver-float ${cover.animationDuration}s ease-in-out infinite`,
            animationDelay: `${cover.animationDelay}s`,
            willChange: 'transform',
          }}
        >
          <img
            src={getCoverUrl(cover.disc.cover_art_path)}
            alt={cover.disc.album}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </>
  );
}

// Ken Burns Animation
function KenBurnsAnimation({
  disc,
  transitioning,
  reducedMotion,
}: {
  disc: Disc;
  transitioning: boolean;
  reducedMotion: boolean;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div
        className={`relative w-[80vmin] h-[80vmin] transition-opacity duration-1000 ${
          transitioning ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <img
          src={getCoverUrl(disc.cover_art_path)}
          alt={disc.album}
          className="w-full h-full object-cover rounded-lg shadow-2xl"
          style={{
            animation: reducedMotion
              ? 'none'
              : 'screensaver-kenburns 12s ease-in-out infinite alternate',
            willChange: 'transform',
          }}
        />
        {/* Subtle info overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 rounded-b-lg">
          <p className="text-white/80 text-lg">{disc.artist}</p>
          <p className="text-white text-xl font-semibold">{disc.album}</p>
          {disc.year && <p className="text-white/60 text-sm">{disc.year}</p>}
        </div>
      </div>
    </div>
  );
}

// Mosaic Animation
function MosaicAnimation({
  covers,
  reducedMotion,
}: {
  covers: Disc[];
  reducedMotion: boolean;
}) {
  const gridSize = 5; // 5x5 grid

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div
        className="grid gap-1"
        style={{
          // Use viewport height to determine tile size for square tiles
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
          // Make the grid square based on the smaller viewport dimension
          width: `min(100vw, 100vh)`,
          height: `min(100vw, 100vh)`,
        }}
      >
        {covers.slice(0, gridSize * gridSize).map((disc, i) => (
          <div
            key={`mosaic-${i}`}
            className={`relative overflow-hidden aspect-square ${reducedMotion ? '' : 'transition-opacity duration-500'}`}
          >
            <img
              src={getCoverUrl(disc.cover_art_path)}
              alt={disc.album}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds?: number): string {
  if (seconds == null) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Now Playing Display
function NowPlayingDisplay({
  playbackState,
}: {
  playbackState: PlaybackState;
}) {
  const { elapsedSeconds } = useTrackTimer(playbackState);

  return (
    <div className="flex flex-col items-center gap-8 animate-in fade-in duration-1000">
      {/* "Now Playing" banner */}
      <div className="text-white/60 text-xl uppercase tracking-[0.3em] font-light">
        Now Playing
      </div>

      {/* Album cover */}
      <div className="relative">
        <div className="absolute -inset-4 bg-white/10 rounded-2xl blur-xl" />
        <img
          src={getCoverUrl(playbackState.cover_art_path)}
          alt={playbackState.album || 'Album'}
          className="relative w-72 h-72 md:w-96 md:h-96 object-cover rounded-xl shadow-2xl"
        />
      </div>

      {/* Track info */}
      <div className="text-center space-y-2">
        <p className="text-white text-2xl md:text-3xl font-bold">
          {playbackState.track_title || `Track ${playbackState.current_track}`}
        </p>
        <p className="text-white/80 text-xl md:text-2xl">
          {playbackState.artist}
        </p>
        <p className="text-white/60 text-lg">
          {playbackState.album}
          {playbackState.year ? ` (${playbackState.year})` : ''}
        </p>
        {playbackState.track_duration && (
          <p className="text-white/50 text-base tabular-nums">
            {formatDuration(elapsedSeconds)} / {formatDuration(playbackState.track_duration)}
          </p>
        )}
      </div>
    </div>
  );
}
