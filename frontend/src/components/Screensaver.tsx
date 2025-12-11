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

  // Slide puzzle state - maps tile ID to its current grid position
  // tilePositions[i] = position in grid for tile i (tile 24 is the empty space)
  const [tilePositions, setTilePositions] = useState<number[]>([]);
  // Track which disc each tile shows (allows changing covers via flip)
  const [tileDiscs, setTileDiscs] = useState<Disc[]>([]);
  // Track which tiles are currently flipping and what they're flipping to
  const [flippingTiles, setFlippingTiles] = useState<Map<number, Disc>>(new Map());
  // Track last move direction: 'horizontal' or 'vertical'
  const lastMoveDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);

  // Initialize mosaic
  useEffect(() => {
    if (animationStyle === 'mosaic' && coversToShow.length > 0) {
      setMosaicCovers(coversToShow.slice(0, 25));
    }
  }, [animationStyle, coversToShow]);

  // Initialize slide puzzle - each tile starts at its own index position
  useEffect(() => {
    if (animationStyle === 'slidepuzzle' && coversToShow.length >= 24) {
      // Initialize: tile 0 at position 0, tile 1 at position 1, etc.
      // Tile 24 is the "empty" tile
      setTilePositions(Array.from({ length: 25 }, (_, i) => i));
      // Initialize tile discs with first 24 covers
      setTileDiscs(coversToShow.slice(0, 24));
      setFlippingTiles(new Map());
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

  // Slide puzzle animation
  useEffect(() => {
    if (!isActive || animationStyle !== 'slidepuzzle' || tilePositions.length < 25) return;

    const gridSize = 5;

    // Get valid moves categorized by direction
    const getValidMoves = (emptyPos: number): { horizontal: number[]; vertical: number[] } => {
      const row = Math.floor(emptyPos / gridSize);
      const col = emptyPos % gridSize;
      const horizontal: number[] = [];
      const vertical: number[] = [];

      // Tile above can move down into empty (vertical)
      if (row > 0) vertical.push(emptyPos - gridSize);
      // Tile below can move up into empty (vertical)
      if (row < gridSize - 1) vertical.push(emptyPos + gridSize);
      // Tile to the left can move right into empty (horizontal)
      if (col > 0) horizontal.push(emptyPos - 1);
      // Tile to the right can move left into empty (horizontal)
      if (col < gridSize - 1) horizontal.push(emptyPos + 1);

      return { horizontal, vertical };
    };

    const interval = setInterval(() => {
      setTilePositions(prev => {
        const newPositions = [...prev];
        const emptyPos = prev[24];
        const { horizontal, vertical } = getValidMoves(emptyPos);

        // Prefer perpendicular direction to last move
        let preferredMoves: number[];
        let newDirection: 'horizontal' | 'vertical';

        if (lastMoveDirectionRef.current === 'horizontal' && vertical.length > 0) {
          // Last was horizontal, prefer vertical
          preferredMoves = vertical;
          newDirection = 'vertical';
        } else if (lastMoveDirectionRef.current === 'vertical' && horizontal.length > 0) {
          // Last was vertical, prefer horizontal
          preferredMoves = horizontal;
          newDirection = 'horizontal';
        } else {
          // No preference or preferred direction not available - pick randomly
          const allMoves = [...horizontal, ...vertical];
          preferredMoves = allMoves;
          // Determine direction based on what we pick
          const targetPos = allMoves[Math.floor(Math.random() * allMoves.length)];
          newDirection = horizontal.includes(targetPos) ? 'horizontal' : 'vertical';

          // Pick from preferred and update direction
          const finalTarget = preferredMoves[Math.floor(Math.random() * preferredMoves.length)];
          const tileAtTarget = prev.findIndex(pos => pos === finalTarget);
          newPositions[tileAtTarget] = emptyPos;
          newPositions[24] = finalTarget;
          lastMoveDirectionRef.current = horizontal.includes(finalTarget) ? 'horizontal' : 'vertical';
          return newPositions;
        }

        const targetPos = preferredMoves[Math.floor(Math.random() * preferredMoves.length)];
        const tileAtTarget = prev.findIndex(pos => pos === targetPos);

        newPositions[tileAtTarget] = emptyPos;
        newPositions[24] = targetPos;
        lastMoveDirectionRef.current = newDirection;

        return newPositions;
      });
    }, 1500); // Move a tile every 1.5 seconds

    return () => clearInterval(interval);
  }, [isActive, animationStyle, tilePositions.length]);

  // Slide puzzle tile flip effect - periodically flip tiles to show new covers
  useEffect(() => {
    if (!isActive || animationStyle !== 'slidepuzzle' || tileDiscs.length < 24 || coversToShow.length < 30) return;

    const gridSize = 5;

    // Different flip patterns with their probabilities
    const getFlipPattern = (): number[] => {
      const roll = Math.random();

      // Single tile (40%)
      if (roll < 0.40) {
        return [Math.floor(Math.random() * 24)];
      }

      // 2-3 random tiles (30%)
      if (roll < 0.70) {
        const count = Math.floor(Math.random() * 2) + 2;
        const tiles: number[] = [];
        while (tiles.length < count) {
          const t = Math.floor(Math.random() * 24);
          if (!tiles.includes(t)) tiles.push(t);
        }
        return tiles;
      }

      // Row (10%)
      if (roll < 0.80) {
        const row = Math.floor(Math.random() * gridSize);
        return Array.from({ length: gridSize }, (_, col) => row * gridSize + col)
          .filter(t => t < 24); // Exclude tile 24 (empty)
      }

      // Column (10%)
      if (roll < 0.90) {
        const col = Math.floor(Math.random() * gridSize);
        return Array.from({ length: gridSize }, (_, row) => row * gridSize + col)
          .filter(t => t < 24);
      }

      // Four corners (5%)
      if (roll < 0.95) {
        // Corners: 0 (top-left), 4 (top-right), 20 (bottom-left), 24 (bottom-right, but may be empty)
        return [0, 4, 20, 24].filter(t => t < 24);
      }

      // Diagonal (3%)
      if (roll < 0.98) {
        const mainDiag = [0, 6, 12, 18, 24].filter(t => t < 24);
        const antiDiag = [4, 8, 12, 16, 20].filter(t => t < 24);
        return Math.random() < 0.5 ? mainDiag : antiDiag;
      }

      // Whole board - all 24 tiles! (2%)
      return Array.from({ length: 24 }, (_, i) => i);
    };

    const interval = setInterval(() => {
      const tilesToFlip = getFlipPattern();

      // Get new discs that aren't currently shown on any tile
      const currentDiscIds = new Set(tileDiscs.map(d => d.id));
      const availableDiscs = coversToShow.filter(d => !currentDiscIds.has(d.id));

      // Need enough unique discs for all tiles we want to flip
      if (availableDiscs.length < tilesToFlip.length) return;

      // Shuffle available discs and pick one unique disc per tile
      const shuffledDiscs = [...availableDiscs].sort(() => Math.random() - 0.5);

      // Prepare new discs for each tile - each gets a unique disc
      const newDiscsMap = new Map<number, Disc>();
      tilesToFlip.forEach((tileId, index) => {
        newDiscsMap.set(tileId, shuffledDiscs[index]);
      });

      // Phase 1: Start flip to 90° (edge-on)
      setFlippingTiles(newDiscsMap);

      // Phase 2: At 90° (halfway), swap the disc and continue to 180°
      // But we want a single flip, so we update disc and let it complete
      setTimeout(() => {
        // Update the actual disc data
        setTileDiscs(prev => {
          const updated = [...prev];
          newDiscsMap.forEach((newDisc, tileId) => {
            updated[tileId] = newDisc;
          });
          return updated;
        });
        // Clear flipping state - disc is now updated, tile shows new cover
        setFlippingTiles(new Map());
      }, 300); // At the halfway point when tile is edge-on
    }, 8000); // Flip tiles every 8 seconds

    return () => clearInterval(interval);
  }, [isActive, animationStyle, tileDiscs, coversToShow]);

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

        {animationStyle === 'slidepuzzle' && (
          <SlidePuzzleAnimation
            discs={tileDiscs}
            tilePositions={tilePositions}
            flippingTiles={flippingTiles}
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

// Slide Puzzle Animation
function SlidePuzzleAnimation({
  discs,
  tilePositions,
  flippingTiles,
  reducedMotion,
}: {
  discs: Disc[];
  tilePositions: number[]; // tilePositions[tileId] = grid position
  flippingTiles: Map<number, Disc>; // tiles currently flipping and their new disc
  reducedMotion: boolean;
}) {
  const gridSize = 5;
  const gap = 4; // gap in pixels

  // Calculate tile size as percentage (accounting for gaps)
  const tileSize = `calc((100% - ${(gridSize - 1) * gap}px) / ${gridSize})`;

  // Convert grid position to x,y coordinates
  const getPosition = (gridPos: number) => {
    const row = Math.floor(gridPos / gridSize);
    const col = gridPos % gridSize;
    return { row, col };
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div
        className="relative"
        style={{
          width: `min(100vw, 100vh)`,
          height: `min(100vw, 100vh)`,
          perspective: '1000px',
        }}
      >
        {/* Render tiles 0-23 (the actual album covers) */}
        {discs.map((disc, tileId) => {
          const pos = tilePositions[tileId];
          if (pos === undefined || !disc) return null;
          const { row, col } = getPosition(pos);
          const isFlipping = flippingTiles.has(tileId);

          return (
            <div
              key={`tile-${tileId}`}
              className={`absolute ${
                reducedMotion ? '' : 'transition-all duration-500 ease-in-out'
              }`}
              style={{
                width: tileSize,
                height: tileSize,
                transform: `translate(calc(${col} * (100% + ${gap}px)), calc(${row} * (100% + ${gap}px)))`,
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Flip container - rotates to 90° (edge-on), image swaps, then back to 0° */}
              <div
                className={reducedMotion ? '' : 'transition-transform duration-300 ease-in-out'}
                style={{
                  width: '100%',
                  height: '100%',
                  transform: isFlipping ? 'rotateY(90deg)' : 'rotateY(0deg)',
                }}
              >
                <img
                  src={getCoverUrl(disc.cover_art_path)}
                  alt={disc.album}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          );
        })}
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
