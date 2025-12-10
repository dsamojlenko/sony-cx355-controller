import { useCallback, useSyncExternalStore } from 'react';

export type AnimationStyle = 'floating' | 'kenburns' | 'mosaic';

export interface ScreensaverSettings {
  enabled: boolean;
  idleTimeoutMinutes: number;
  animationStyle: AnimationStyle;
}

const STORAGE_KEY = 'screensaver-settings';
const SETTINGS_CHANGE_EVENT = 'screensaver-settings-change';

const DEFAULT_SETTINGS: ScreensaverSettings = {
  enabled: true,
  idleTimeoutMinutes: 5,
  animationStyle: 'floating',
};

function loadSettings(): ScreensaverSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: ScreensaverSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Dispatch custom event to notify other hook instances
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: settings }));
  } catch {
    // Ignore storage errors
  }
}

// Store for useSyncExternalStore
let currentSettings = loadSettings();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      currentSettings = loadSettings();
      callback();
    }
  };

  const handleSettingsChange = (e: Event) => {
    const customEvent = e as CustomEvent<ScreensaverSettings>;
    currentSettings = customEvent.detail;
    callback();
  };

  window.addEventListener('storage', handleStorageChange);
  window.addEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);

  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
  };
}

function getSnapshot() {
  return currentSettings;
}

export function useScreensaverSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot);

  const updateSettings = useCallback((updates: Partial<ScreensaverSettings>) => {
    const newSettings = { ...currentSettings, ...updates };
    currentSettings = newSettings;
    saveSettings(newSettings);
    // Notify all listeners
    listeners.forEach(listener => listener());
  }, []);

  return { settings, updateSettings };
}
