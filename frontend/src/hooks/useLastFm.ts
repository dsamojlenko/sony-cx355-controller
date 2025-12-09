import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLastFmStatus, getLastFmAuthUrl, disconnectLastFm } from '@/lib/api';

export function useLastFmStatus() {
  return useQuery({
    queryKey: ['lastfm', 'status'],
    queryFn: getLastFmStatus,
    staleTime: 30000,
  });
}

export function useLastFmConnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { authUrl } = await getLastFmAuthUrl();
      // Open Last.fm auth in a popup or redirect
      window.location.href = authUrl;
    },
    onSuccess: () => {
      // Invalidate status after auth completes
      queryClient.invalidateQueries({ queryKey: ['lastfm', 'status'] });
    },
  });
}

export function useLastFmDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectLastFm,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lastfm', 'status'] });
    },
  });
}
