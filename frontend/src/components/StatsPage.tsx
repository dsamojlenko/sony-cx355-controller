import { useStats } from '@/hooks/useStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Disc as DiscIcon, Play, Clock, Library } from 'lucide-react';
import { getCoverUrl } from '@/lib/utils';
import type { Disc } from '@/types';

interface DiscListItemProps {
  disc: Disc;
  onClick?: () => void;
  showPlayCount?: boolean;
}

function DiscListItem({ disc, onClick, showPlayCount }: DiscListItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-2 rounded hover:bg-accent/50 transition-colors w-full text-left"
    >
      <div className="w-12 h-12 rounded bg-muted shrink-0 overflow-hidden">
        <img
          src={getCoverUrl(disc.cover_art_path)}
          alt={disc.album}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-sm">{disc.album}</div>
        <div className="text-xs text-muted-foreground truncate">{disc.artist}</div>
      </div>
      {showPlayCount && disc.play_count > 0 && (
        <div className="text-xs text-muted-foreground">
          {disc.play_count} play{disc.play_count !== 1 ? 's' : ''}
        </div>
      )}
    </button>
  );
}

interface StatsPageProps {
  onDiscSelect: (disc: Disc) => void;
}

export function StatsPage({ onDiscSelect }: StatsPageProps) {
  const { data, isLoading, error } = useStats();

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Failed to load stats: {error.message}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Discs</CardTitle>
            <Library className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalDiscs}</div>
            <p className="text-xs text-muted-foreground">
              P1: {data.player1Discs} · P2: {data.player2Discs}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Plays</CardTitle>
            <Play className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalPlays}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Most Played</CardTitle>
            <DiscIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {data.mostPlayed[0] ? (
              <>
                <div className="text-lg font-bold truncate">
                  {data.mostPlayed[0].album}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {data.mostPlayed[0].artist}
                </p>
              </>
            ) : (
              <div className="text-muted-foreground">No plays yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Last Played</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {data.recentlyPlayed[0] ? (
              <>
                <div className="text-lg font-bold truncate">
                  {data.recentlyPlayed[0].album}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {data.recentlyPlayed[0].artist}
                </p>
              </>
            ) : (
              <div className="text-muted-foreground">No plays yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Most Played */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Most Played</CardTitle>
          </CardHeader>
          <CardContent className="p-0 px-2 pb-2">
            {data.mostPlayed.length > 0 ? (
              <div className="space-y-1">
                {data.mostPlayed.map((disc) => (
                  <DiscListItem
                    key={`${disc.player}-${disc.position}`}
                    disc={disc}
                    onClick={() => onDiscSelect(disc)}
                    showPlayCount
                  />
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                No plays recorded yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recently Played */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recently Played</CardTitle>
          </CardHeader>
          <CardContent className="p-0 px-2 pb-2">
            {data.recentlyPlayed.length > 0 ? (
              <div className="space-y-1">
                {data.recentlyPlayed.map((disc) => (
                  <DiscListItem
                    key={`${disc.player}-${disc.position}`}
                    disc={disc}
                    onClick={() => onDiscSelect(disc)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                No plays recorded yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
