import { useState, useMemo, useRef, useCallback } from 'react';
import { useDiscs } from '@/hooks/useDiscs';
import { usePlaybackState } from '@/hooks/usePlaybackState';
import { DiscCard } from './DiscCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, X } from 'lucide-react';
import type { Disc, PlayerFilter } from '@/types';

interface DiscGridProps {
  onDiscSelect: (disc: Disc) => void;
}

export function DiscGrid({ onDiscSelect }: DiscGridProps) {
  const [search, setSearch] = useState('');
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('all');
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading, error } = useDiscs({
    player: playerFilter,
    search: search || undefined,
    limit,
    offset: page * limit,
  });

  const { state: playbackState } = usePlaybackState();
  const gridRef = useRef<HTMLDivElement>(null);

  // Get number of columns based on current grid layout
  const getColumnCount = useCallback(() => {
    if (!gridRef.current) return 1;
    const gridStyle = window.getComputedStyle(gridRef.current);
    const columns = gridStyle.getPropertyValue('grid-template-columns').split(' ').length;
    return columns;
  }, []);

  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!gridRef.current || !data?.discs.length) return;

    const focusableCards = Array.from(
      gridRef.current.querySelectorAll('[role="button"][tabindex="0"]')
    ) as HTMLElement[];

    const currentIndex = focusableCards.findIndex(
      (card) => card === document.activeElement
    );

    if (currentIndex === -1) return;

    const columns = getColumnCount();
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = Math.min(currentIndex + 1, focusableCards.length - 1);
        break;
      case 'ArrowLeft':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + columns, focusableCards.length - 1);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - columns, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = focusableCards.length - 1;
        break;
      default:
        return;
    }

    if (nextIndex !== currentIndex) {
      e.preventDefault();
      focusableCards[nextIndex]?.focus();
    }
  }, [data?.discs.length, getColumnCount]);

  const totalPages = useMemo(() => {
    if (!data?.total) return 0;
    return Math.ceil(data.total / limit);
  }, [data?.total]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Failed to load discs: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search artist or album..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setPage(0);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant={playerFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setPlayerFilter('all');
              setPage(0);
            }}
          >
            All
          </Button>
          <Button
            variant={playerFilter === 1 ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setPlayerFilter(1);
              setPage(0);
            }}
          >
            Player 1
          </Button>
          <Button
            variant={playerFilter === 2 ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setPlayerFilter(2);
              setPage(0);
            }}
          >
            Player 2
          </Button>
        </div>
      </div>

      {/* Results count */}
      {data && (
        <div className="text-sm text-muted-foreground">
          {data.total} disc{data.total !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square rounded" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            ref={gridRef}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            onKeyDown={handleGridKeyDown}
            role="grid"
            aria-label="Disc collection"
          >
            {data?.discs.map((disc) => (
              <DiscCard
                key={`${disc.player}-${disc.position}`}
                disc={disc}
                onClick={() => onDiscSelect(disc)}
                isPlaying={
                  playbackState?.current_player === disc.player &&
                  playbackState?.current_disc === disc.position
                }
              />
            ))}
          </div>

          {/* Empty state */}
          {data?.discs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <p>No discs found</p>
              {search && (
                <Button
                  variant="link"
                  onClick={() => {
                    setSearch('');
                    setPage(0);
                  }}
                >
                  Clear search
                </Button>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
