import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCoverUrl } from '@/lib/utils';
import type { Disc } from '@/types';

interface DiscCardProps {
  disc: Disc;
  onClick?: () => void;
  isPlaying?: boolean;
}

export function DiscCard({ disc, onClick, isPlaying }: DiscCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:bg-accent/50 ${
        isPlaying ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Cover Art */}
        <div className="aspect-square rounded bg-muted mb-3 overflow-hidden">
          <img
            src={getCoverUrl(disc.cover_art_path)}
            alt={`${disc.artist} - ${disc.album}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
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
