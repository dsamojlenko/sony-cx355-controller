import { usePlaybackState } from '@/hooks/usePlaybackState';
import { useTransportControls } from '@/hooks/useCommands';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Loader2,
} from 'lucide-react';
import { getCoverUrl } from '@/lib/utils';

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function NowPlaying() {
  const { state, isLoading } = usePlaybackState();
  const controls = useTransportControls();

  if (isLoading) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Skeleton className="w-16 h-16 rounded" />
          <div className="flex-1">
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    );
  }

  const isPlaying = state?.state === 'play';
  const isLoadingDisc = state?.state === 'loading';
  const hasDisc = state?.current_disc != null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-50">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        {/* Cover Art */}
        <div className="w-16 h-16 rounded bg-muted shrink-0 overflow-hidden">
          <img
            src={getCoverUrl(state?.cover_art_path)}
            alt={state?.album || 'Album cover'}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Track Info */}
        <div className="flex-1 min-w-0">
          {hasDisc ? (
            <>
              <div className="font-medium truncate">
                {state?.track_title || `Track ${state?.current_track || 1}`}
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {state?.artist} — {state?.album}
              </div>
              <div className="text-xs text-muted-foreground">
                Player {state?.current_player} · Disc {state?.current_disc} ·{' '}
                {formatDuration(state?.track_duration)}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">No disc playing</div>
          )}
        </div>

        {/* Transport Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => controls.previous()}
            disabled={!hasDisc || controls.isLoading}
          >
            <SkipBack className="w-5 h-5" />
          </Button>

          {isLoadingDisc ? (
            <Button variant="ghost" size="icon" disabled>
              <Loader2 className="w-5 h-5 animate-spin" />
            </Button>
          ) : isPlaying ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => controls.pause()}
              disabled={controls.isLoading}
            >
              <Pause className="w-5 h-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (hasDisc && state?.current_player && state?.current_disc) {
                  controls.play({
                    player: state.current_player,
                    disc: state.current_disc,
                    track: state.current_track ?? undefined,
                  });
                }
              }}
              disabled={!hasDisc || controls.isLoading}
            >
              <Play className="w-5 h-5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => controls.stop()}
            disabled={!hasDisc || controls.isLoading}
          >
            <Square className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => controls.next()}
            disabled={!hasDisc || controls.isLoading}
          >
            <SkipForward className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
