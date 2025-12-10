import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import { getCoverUrl } from '@/lib/utils';
import type { Disc } from '@/types';

interface DiscCardProps {
  disc: Disc;
  onClick?: () => void;
  isPlaying?: boolean;
}

export function DiscCard({ disc, onClick, isPlaying }: DiscCardProps) {
  // Check if disc needs enrichment (missing MusicBrainz data)
  const needsEnrichment = !disc.musicbrainz_id || !disc.track_count;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <Card
      className={`cursor-pointer transition-all hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        isPlaying ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${disc.artist} - ${disc.album}, Player ${disc.player} position ${disc.position}`}
    >
      <CardContent className="p-3">
        {/* Cover Art */}
        <div className="aspect-square rounded bg-muted mb-3 overflow-hidden relative">
          <img
            src={getCoverUrl(disc.cover_art_path)}
            alt={`${disc.artist} - ${disc.album}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {needsEnrichment && (
            <div
              className="absolute top-1 right-1 p-1 rounded-full bg-yellow-500/90 text-yellow-950"
              title="Missing metadata - click to fix"
            >
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-1">
          <div className="font-medium text-sm truncate" title={disc.album}>
            {disc.album}
          </div>
          <div className="text-xs text-muted-foreground truncate" title={disc.artist}>
            {disc.artist}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              P{disc.player}:{disc.position}
            </Badge>
            {disc.year && (
              <span className="text-xs text-muted-foreground">{disc.year}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
