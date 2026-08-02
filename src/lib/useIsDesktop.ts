'use client';

import { useSyncExternalStore } from 'react';

const DESKTOP_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mediaQueryList = window.matchMedia(DESKTOP_QUERY);
  mediaQueryList.addEventListener('change', onChange);
  return () => mediaQueryList.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
