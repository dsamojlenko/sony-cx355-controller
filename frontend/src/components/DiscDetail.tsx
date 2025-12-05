import { useState } from 'react';
import { useDisc } from '@/hooks/useDiscs';
import { usePlay } from '@/hooks/useCommands';
import { usePlaybackState } from '@/hooks/usePlaybackState';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { MatchFixer } from './MatchFixer';
import { Play, Clock, Wrench, AlertCircle } from 'lucide-react';
import { getCoverUrl } from '@/lib/utils';
import type { Disc } from '@/types';

interface DiscDetailProps {
  disc: Disc | null;
  open: boolean;
  onClose: () => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTotalDuration(seconds?: number): string {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins} min`;
}

export function DiscDetail({ disc, open, onClose }: DiscDetailProps) {
  const [matchFixerOpen, setMatchFixerOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: discWithTracks, isLoading } = useDisc(
    disc?.player ?? 1,
    disc?.position ?? 1,
    open && disc != null
  );

  const { mutate: play, isPending: isPlayPending } = usePlay();
  const { state: playbackState } = usePlaybackState();

  const isCurrentDisc =
    playbackState?.current_player === disc?.player &&
    playbackState?.current_disc === disc?.position;

  // Check if disc needs enrichment (missing metadata)
  const needsEnrichment = discWithTracks && (
    !discWithTracks.musicbrainz_id ||
    !discWithTracks.track_count ||
    discWithTracks.track_count === 0
  );

  const handlePlayDisc = () => {
    if (!disc) return;
    play({ player: disc.player, disc: disc.position });
  };

  const handlePlayTrack = (trackNumber: number) => {
    if (!disc) return;
    play({ player: disc.player, disc: disc.position, track: trackNumber });
  };

  const handleMatchFixerSuccess = () => {
    // Refresh disc data after successful match fix
    if (disc) {
      queryClient.invalidateQueries({ queryKey: ['disc', disc.player, disc.position] });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="sr-only">
              {disc?.artist} - {disc?.album}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-4">
              <div className="flex gap-4">
                <Skeleton className="w-40 h-40 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ) : discWithTracks ? (
            <>
              {/* Missing metadata warning */}
              {needsEnrichment && (
                <div className="flex items-center gap-2 p-3 mb-4 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-sm">
                    This disc is missing metadata.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setMatchFixerOpen(true)}
                  >
                    <Wrench className="w-3 h-3 mr-1" />
                    Fix Match
                  </Button>
                </div>
              )}

              {/* Header with cover and info */}
              <div className="flex gap-4 mb-4">
                {/* Cover Art */}
                <div className="w-40 h-40 rounded bg-muted shrink-0 overflow-hidden">
                  <img
                    src={getCoverUrl(discWithTracks.cover_art_path)}
                    alt={discWithTracks.album}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold truncate">{discWithTracks.album}</h2>
                  <p className="text-lg text-muted-foreground truncate">
                    {discWithTracks.artist}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="secondary">
                      Player {discWithTracks.player} · Slot {discWithTracks.position}
                    </Badge>
                    {discWithTracks.year && (
                      <Badge variant="outline">{discWithTracks.year}</Badge>
                    )}
                    {discWithTracks.genre && (
                      <Badge variant="outline">{discWithTracks.genre}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {discWithTracks.track_count || 0} tracks
                    {discWithTracks.duration_seconds && (
                      <> · {formatTotalDuration(discWithTracks.duration_seconds)}</>
                    )}
                    {discWithTracks.play_count > 0 && (
                      <> · Played {discWithTracks.play_count} time{discWithTracks.play_count !== 1 ? 's' : ''}</>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={handlePlayDisc}
                      disabled={isPlayPending}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Play Album
                    </Button>
                    {!needsEnrichment && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setMatchFixerOpen(true)}
                        title="Fix MusicBrainz match"
                      >
                        <Wrench className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Track list */}
              <ScrollArea className="flex-1 -mx-6 px-6">
                {discWithTracks.tracks.length > 0 ? (
                  <div className="space-y-1">
                    {discWithTracks.tracks.map((track) => {
                      const isCurrentTrack =
                        isCurrentDisc && playbackState?.current_track === track.track_number;

                      return (
                        <button
                          key={track.track_number}
                          onClick={() => handlePlayTrack(track.track_number)}
                          disabled={isPlayPending}
                          className={`w-full flex items-center gap-3 p-2 rounded text-left hover:bg-accent/50 transition-colors ${
                            isCurrentTrack ? 'bg-accent' : ''
                          }`}
                        >
                          <span className="w-8 text-center text-sm text-muted-foreground">
                            {isCurrentTrack && playbackState?.state === 'play' ? (
                              <span className="text-primary">▶</span>
                            ) : (
                              track.track_number
                            )}
                          </span>
                          <span className="flex-1 truncate">{track.title}</span>
                          {track.duration_seconds && (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(track.duration_seconds)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No track information available.</p>
                    <Button
                      variant="link"
                      onClick={() => setMatchFixerOpen(true)}
                      className="mt-2"
                    >
                      Fix MusicBrainz match to load tracks
                    </Button>
                  </div>
                )}
              </ScrollArea>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Match Fixer Dialog */}
      <MatchFixer
        disc={discWithTracks || disc}
        open={matchFixerOpen}
        onClose={() => setMatchFixerOpen(false)}
        onSuccess={handleMatchFixerSuccess}
      />
    </>
  );
}
