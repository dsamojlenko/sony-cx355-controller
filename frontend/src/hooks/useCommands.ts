import { useMutation } from '@tanstack/react-query';
import { play, pause, stop, nextTrack, previousTrack } from '@/lib/api';

export function usePlay() {
  return useMutation({
    mutationFn: ({ player, disc, track }: { player: number; disc: number; track?: number }) =>
      play(player, disc, track),
  });
}

export function usePause() {
  return useMutation({
    mutationFn: pause,
  });
}

export function useStop() {
  return useMutation({
    mutationFn: stop,
  });
}

export function useNextTrack() {
  return useMutation({
    mutationFn: nextTrack,
  });
}

export function usePreviousTrack() {
  return useMutation({
    mutationFn: previousTrack,
  });
}

export function useTransportControls() {
  const playMutation = usePlay();
  const pauseMutation = usePause();
  const stopMutation = useStop();
  const nextMutation = useNextTrack();
  const prevMutation = usePreviousTrack();

  return {
    play: playMutation.mutate,
    pause: pauseMutation.mutate,
    stop: stopMutation.mutate,
    next: nextMutation.mutate,
    previous: prevMutation.mutate,
    isLoading:
      playMutation.isPending ||
      pauseMutation.isPending ||
      stopMutation.isPending ||
      nextMutation.isPending ||
      prevMutation.isPending,
  };
}
