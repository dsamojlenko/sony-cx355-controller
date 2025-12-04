import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDiscs, getDisc, updateDisc } from '@/lib/api';
import type { PlayerFilter, Disc } from '@/types';

export function useDiscs(params?: {
  player?: PlayerFilter;
  search?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['discs', params],
    queryFn: () => getDiscs(params),
    staleTime: 60000,
  });
}

export function useDisc(player: number, position: number, enabled = true) {
  return useQuery({
    queryKey: ['disc', player, position],
    queryFn: () => getDisc(player, position),
    enabled,
    staleTime: 60000,
  });
}

export function useUpdateDisc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      player,
      position,
      data,
    }: {
      player: number;
      position: number;
      data: Partial<Disc>;
    }) => updateDisc(player, position, data),
    onSuccess: (_, { player, position }) => {
      // Invalidate both the single disc and the list
      queryClient.invalidateQueries({ queryKey: ['disc', player, position] });
      queryClient.invalidateQueries({ queryKey: ['discs'] });
    },
  });
}
