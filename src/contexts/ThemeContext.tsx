import React, { useEffect, useState, useCallback } from 'react';
import { ThemeContext, type AppearancePreference, type ResolvedTheme } from './themeContextObject';

const STORAGE_KEY = 'voiceforce.appearance';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readStoredPreference(): AppearancePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // localStorage unavailable — fall through to default
  }
  return 'dark';
}

function applyResolvedTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<AppearancePreference>(() => readStoredPreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const pref = readStoredPreference();
    return pref === 'system' ? getSystemTheme() : pref;
  });

  // Apply + persist whenever preference changes.
  useEffect(() => {
    const resolved = preference === 'system' ? getSystemTheme() : preference;
    setResolvedTheme(resolved);
    applyResolvedTheme(resolved);
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // best-effort only
    }
  }, [preference]);

  // Live-react to OS appearance changes, but ONLY while preference === 'system'.
  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      applyResolvedTheme(resolved);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [preference]);

  const setPreference = useCallback((pref: AppearancePreference) => {
    setPreferenceState(pref);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export type { AppearancePreference } from './themeContextObject';
