import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchMusicBrainz, enrichDisc } from '@/lib/api';

export function useMusicBrainzSearch(artist: string, album: string, enabled = true) {
  return useQuery({
    queryKey: ['musicbrainz-search', artist, album],
    queryFn: () => searchMusicBrainz(artist, album),
    enabled: enabled && artist.length > 0 && album.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useEnrichDisc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      player,
      position,
      musicbrainzId,
    }: {
      player: number;
      position: number;
      musicbrainzId?: string;
    }) => enrichDisc(player, position, musicbrainzId),
    onSuccess: (_, { player, position }) => {
      // Invalidate disc queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['disc', player, position] });
      queryClient.invalidateQueries({ queryKey: ['discs'] });
    },
  });
}
