import { createContext } from 'react';

export type AppearancePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  preference: AppearancePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (pref: AppearancePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
