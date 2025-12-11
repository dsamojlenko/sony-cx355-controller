import { useEffect, useRef, useState } from 'react';
import type { PlaybackState } from '@/types';

interface TrackTimerResult {
  elapsedSeconds: number;
  remainingSeconds: number | null;
}

export function useTrackTimer(state: PlaybackState | null | undefined): TrackTimerResult {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTrackRef = useRef<string | null>(null);

  // Create a unique key for the current track
  const trackKey = state
    ? `${state.current_player}-${state.current_disc}-${state.current_track}`
    : null;

  // Reset elapsed time when track changes
  useEffect(() => {
    if (trackKey !== lastTrackRef.current) {
      setElapsedSeconds(0);
      lastTrackRef.current = trackKey;
    }
  }, [trackKey]);

  // Handle timer based on playback state
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only run timer when playing
    if (state?.state === 'play') {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          // Cap at track duration if known
          if (state.track_duration && prev >= state.track_duration) {
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state?.state, state?.track_duration]);

  // Calculate remaining time
  const remainingSeconds =
    state?.track_duration != null ? Math.max(0, state.track_duration - elapsedSeconds) : null;

  return {
    elapsedSeconds,
    remainingSeconds,
  };
}
