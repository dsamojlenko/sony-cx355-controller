import { useState, useEffect, useCallback, useRef } from 'react';

interface UseIdleDetectionOptions {
  timeoutMinutes: number;
  enabled?: boolean;
}

export function useIdleDetection({ timeoutMinutes, enabled = true }: UseIdleDetectionOptions) {
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdle = useCallback(() => {
    setIsIdle(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsIdle(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;

    const startIdleTimer = () => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        setIsIdle(true);
      }, timeoutMs);
    };

    const handleActivity = () => {
      // Reset idle state if currently idle
      setIsIdle(false);

      // Restart the idle timer
      startIdleTimer();
    };

    // Throttle function to limit event handler calls
    const throttledHandleActivity = () => {
      if (throttleTimeoutRef.current) return;

      handleActivity();

      throttleTimeoutRef.current = setTimeout(() => {
        throttleTimeoutRef.current = null;
      }, 200); // Throttle to max once per 200ms
    };

    // Events to track
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, throttledHandleActivity, { passive: true });
    });

    // Start initial timeout
    startIdleTimer();

    return () => {
      // Remove event listeners
      events.forEach(event => {
        document.removeEventListener(event, throttledHandleActivity);
      });

      // Clear timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, [timeoutMinutes, enabled]);

  return { isIdle, resetIdle };
}
