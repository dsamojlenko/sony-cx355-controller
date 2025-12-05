import { useState } from 'react';
import { useMusicBrainzSearch, useEnrichDisc } from '@/hooks/useMusicBrainz';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { Disc, MusicBrainzRelease } from '@/types';

interface MatchFixerProps {
  disc: Disc | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function ReleaseCard({
  release,
  selected,
  onSelect,
}: {
  release: MusicBrainzRelease;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded border transition-colors ${
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50 hover:bg-accent/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{release.title}</div>
          <div className="text-sm text-muted-foreground truncate">
            {release.artist}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {release.format !== 'Unknown' && (
              <Badge variant="default" className="text-xs">
                {release.format}
              </Badge>
            )}
            {release.date !== 'Unknown' && (
              <Badge variant="secondary" className="text-xs">
                {release.date.split('-')[0]}
              </Badge>
            )}
            {release.country !== 'Unknown' && (
              <Badge variant="outline" className="text-xs">
                {release.country}
              </Badge>
            )}
            {release.label !== 'Unknown' && (
              <Badge variant="outline" className="text-xs">
                {release.label}
              </Badge>
            )}
          </div>
        </div>
        {selected && <Check className="w-5 h-5 text-primary shrink-0" />}
      </div>
    </button>
  );
}

export function MatchFixer({ disc, open, onClose, onSuccess }: MatchFixerProps) {
  const [searchArtist, setSearchArtist] = useState('');
  const [searchAlbum, setSearchAlbum] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<MusicBrainzRelease | null>(null);
  const [manualMbid, setManualMbid] = useState('');

  // Use custom search terms if set, otherwise use disc's original values
  const effectiveArtist = searchArtist || disc?.artist || '';
  const effectiveAlbum = searchAlbum || disc?.album || '';

  const {
    data: releases,
    isLoading: isSearching,
    error: searchError,
    refetch,
  } = useMusicBrainzSearch(effectiveArtist, effectiveAlbum, hasSearched);

  const enrichMutation = useEnrichDisc();

  // Reset state when dialog opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSearchArtist('');
      setSearchAlbum('');
      setHasSearched(false);
      setSelectedRelease(null);
      setManualMbid('');
      onClose();
    }
  };

  const handleSearch = () => {
    setHasSearched(true);
    setSelectedRelease(null);
    refetch();
  };

  const handleApply = async () => {
    if (!disc) return;

    const mbid = selectedRelease?.id || manualMbid.trim();
    if (!mbid) return;

    try {
      await enrichMutation.mutateAsync({
        player: disc.player,
        position: disc.position,
        musicbrainzId: mbid,
      });
      onSuccess?.();
      handleOpenChange(false);
    } catch (error) {
      // Error is handled by mutation state
    }
  };

  // Extract MBID from URL if pasted
  const handleManualMbidChange = (value: string) => {
    // Handle MusicBrainz URLs like https://musicbrainz.org/release/xxx-xxx-xxx
    const urlMatch = value.match(/musicbrainz\.org\/release\/([a-f0-9-]{36})/i);
    if (urlMatch) {
      setManualMbid(urlMatch[1]);
    } else {
      setManualMbid(value);
    }
  };

  const canApply = selectedRelease || (manualMbid.trim().length === 36);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Fix MusicBrainz Match</DialogTitle>
          <DialogDescription>
            Search for the correct release or enter a MusicBrainz ID directly.
          </DialogDescription>
        </DialogHeader>

        {disc && (
          <div className="text-sm text-muted-foreground shrink-0">
            Currently: <strong>{disc.artist}</strong> — <strong>{disc.album}</strong>
            {disc.musicbrainz_id && (
              <span className="ml-2 text-xs">
                (MBID: {disc.musicbrainz_id.slice(0, 8)}...)
              </span>
            )}
          </div>
        )}

        {/* Search Form */}
        <div className="space-y-3 shrink-0">
          <div className="flex gap-2">
            <Input
              placeholder="Artist"
              value={searchArtist}
              onChange={(e) => setSearchArtist(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Input
              placeholder="Album"
              value={searchAlbum}
              onChange={(e) => setSearchAlbum(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isSearching}>
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {!hasSearched && (
            <p className="text-sm text-muted-foreground">
              Modify the search terms above if needed, then click search.
              The original artist/album will be used if left blank.
            </p>
          )}
        </div>

        {/* Search Results - scrollable area with explicit max height */}
        {hasSearched && (
          <div className="mt-4 max-h-[40vh] overflow-y-auto -mx-6 px-6">
            {isSearching ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : searchError ? (
              <div className="flex items-center gap-2 text-destructive p-4">
                <AlertCircle className="w-5 h-5" />
                <span>Search failed. Please try again.</span>
              </div>
            ) : releases && releases.length > 0 ? (
              <div className="space-y-2 pb-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Found {releases.length} release{releases.length !== 1 ? 's' : ''}.
                  Select the correct one:
                </p>
                {releases.map((release) => (
                  <ReleaseCard
                    key={release.id}
                    release={release}
                    selected={selectedRelease?.id === release.id}
                    onSelect={() => {
                      setSelectedRelease(release);
                      setManualMbid('');
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No releases found.</p>
                <p className="text-sm mt-2">
                  Try different search terms or enter an MBID manually below.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer - always visible */}
        <div className="shrink-0 space-y-4 mt-4">
          {/* Manual MBID Entry */}
          <div className="pt-4 border-t border-border">
            <label className="text-sm font-medium">
              Or enter MusicBrainz Release ID manually:
            </label>
            <Input
              placeholder="e.g., 12345678-1234-1234-1234-123456789012 or paste URL"
              value={manualMbid}
              onChange={(e) => handleManualMbidChange(e.target.value)}
              className="mt-2"
              disabled={!!selectedRelease}
            />
            {selectedRelease && (
              <p className="text-xs text-muted-foreground mt-1">
                Clear the selected release above to enter an ID manually.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!canApply || enrichMutation.isPending}
            >
              {enrichMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                'Apply Match'
              )}
            </Button>
          </div>

          {enrichMutation.isError && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>
                Failed to apply match: {enrichMutation.error?.message || 'Unknown error'}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
