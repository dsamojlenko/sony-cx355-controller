import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentState } from '@/lib/api';
import { socketClient } from '@/lib/socket';
import type { PlaybackState } from '@/types';

export function usePlaybackState() {
  const queryClient = useQueryClient();
  const [realtimeState, setRealtimeState] = useState<PlaybackState | null>(null);

  // Initial fetch
  const { data: initialState, isLoading, error } = useQuery({
    queryKey: ['playbackState'],
    queryFn: getCurrentState,
    staleTime: 30000,
  });

  // Socket connection and updates
  useEffect(() => {
    socketClient.connect();

    const unsubscribe = socketClient.onStateChange((state) => {
      setRealtimeState(state);
      // Also update query cache
      queryClient.setQueryData(['playbackState'], state);
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  // Combine initial and realtime state
  const state = realtimeState || initialState;

  return {
    state,
    isLoading,
    error,
  };
}

export function useMetadataUpdates(onUpdate: (player: number, position: number) => void) {
  const callback = useCallback(
    ({ player, position }: { player: number; position: number }) => {
      onUpdate(player, position);
    },
    [onUpdate]
  );

  useEffect(() => {
    socketClient.connect();
    const unsubscribe = socketClient.onMetadataUpdate(callback);
    return unsubscribe;
  }, [callback]);
}
