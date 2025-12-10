import { useState, useEffect, useCallback, useRef } from 'react';

interface UseIdleDetectionOptions {
  timeoutMinutes: number;
  enabled?: boolean;
}

export function useIdleDetection({ timeoutMinutes, enabled = true }: UseIdleDetectionOptions) {
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const resetIdle = useCallback(() => {
    setIsIdle(false);
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsIdle(false);
      return;
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();

      if (isIdle) {
        setIsIdle(false);
      }

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        setIsIdle(true);
      }, timeoutMs);
    };

    // Throttle function to limit event handler calls
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
    const throttledHandleActivity = () => {
      if (throttleTimeout) return;

      handleActivity();

      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
      }, 200); // Throttle to max once per 200ms
    };

    // Events to track
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, throttledHandleActivity, { passive: true });
    });

    // Start initial timeout
    handleActivity();

    return () => {
      // Remove event listeners
      events.forEach(event => {
        document.removeEventListener(event, throttledHandleActivity);
      });

      // Clear timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
    };
  }, [timeoutMinutes, enabled, isIdle]);

  return { isIdle, resetIdle };
}
