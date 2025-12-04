import { useState, useMemo } from 'react';
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
