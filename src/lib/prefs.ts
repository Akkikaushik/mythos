import { useSyncExternalStore } from 'react';

export interface Prefs {
  sound: boolean;
  volume: number; // 0..1
  reducedMotion: boolean;
  showExplanations: boolean;
}

const KEY = 'mythos.prefs';
const DEFAULTS: Prefs = { sound: true, volume: 0.5, reducedMotion: false, showExplanations: true };

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

function apply() {
  document.documentElement.classList.toggle('reduce-motion', current.reducedMotion);
}
apply();

export function getPrefs() {
  return current;
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  apply();
  for (const l of listeners) l();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
