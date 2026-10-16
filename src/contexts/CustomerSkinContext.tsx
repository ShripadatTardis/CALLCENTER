import React, { useCallback, useEffect, useState } from 'react';
import { CustomerSkinContext } from './customerSkinContextObject';
import { useTheme } from '@/hooks/useTheme';
import type { AppearancePreference } from './themeContextObject';
import { CUSTOMER_SKIN_CONFIGS, isCustomerSkin, type CustomerSkin } from '@/theme/customerConfigs';
import { applyCustomerSkin } from '@/theme/applyCustomerSkin';

/**
 * Session 7.12 — Runtime Customer Skin Selection (Demo Skin Selector).
 * Deliberately a SEPARATE context from `ThemeContext` (Session 7.x
 * Light/Dark/System) — this answers "which customer's presentation
 * values" (VoiceForce vs KATON), a fully independent dimension from
 * "which appearance mode", not a replacement or extension of it. Mounts
 * INSIDE `ThemeProvider` (see `src/main.tsx`) because it needs to read
 * the resolved light/dark mode to know which half of a skin's
 * declarations to apply (see `applyCustomerSkin`), and it calls the
 * existing `setPreference` to restore each skin's own remembered
 * Light/Dark/System choice — it never reimplements appearance logic.
 *
 * Presentation-only: this context holds nothing but a `CustomerSkin`
 * string and a setter. It never touches authentication, tenant
 * identity, permissions, business data, API routing, or Business Data
 * Scope — nothing here is sent to any API call or read by any data
 * hook. The actual application identity/tenant remains VoiceForce
 * (TARDIS) regardless of which skin is selected; switching only
 * changes which centrally-configured presentation values are applied
 * to the DOM via `applyCustomerSkin`.
 */

const SKIN_STORAGE_KEY = 'voiceforce.demoSkin';
const APPEARANCE_BY_SKIN_STORAGE_KEY = 'voiceforce.demoSkin.appearanceBySkin';
const DEFAULT_SKIN: CustomerSkin = 'voiceforce';

function readStoredSkin(): CustomerSkin {
  try {
    const raw = window.localStorage.getItem(SKIN_STORAGE_KEY);
    if (isCustomerSkin(raw)) return raw;
  } catch {
    // localStorage unavailable — fall through to default
  }
  return DEFAULT_SKIN;
}

function readAppearanceBySkin(): Partial<Record<CustomerSkin, AppearancePreference>> {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_BY_SKIN_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Partial<Record<CustomerSkin, AppearancePreference>>;
  } catch {
    // corrupt/unavailable storage — treat as empty
  }
  return {};
}

function writeAppearanceForSkin(skin: CustomerSkin, pref: AppearancePreference) {
  try {
    const current = readAppearanceBySkin();
    current[skin] = pref;
    window.localStorage.setItem(APPEARANCE_BY_SKIN_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // best-effort only
  }
}

export const CustomerSkinProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { resolvedTheme, preference, setPreference } = useTheme();
  const [skin, setSkinState] = useState<CustomerSkin>(() => readStoredSkin());

  // Apply on mount and whenever the skin OR the resolved light/dark
  // appearance changes. Always a full re-apply (see applyCustomerSkin's
  // own comment) — correct and idempotent regardless of what was
  // previously on the DOM.
  useEffect(() => {
    applyCustomerSkin(CUSTOMER_SKIN_CONFIGS[skin], resolvedTheme);
  }, [skin, resolvedTheme]);

  // Brief: "Preserve independent Light/Dark/System preferences for each
  // skin." Every time the active skin's appearance preference settles
  // (including the very first time a skin is seen, capturing whatever
  // the global preference already was), remember it against THIS skin —
  // never against the other one.
  useEffect(() => {
    writeAppearanceForSkin(skin, preference);
  }, [skin, preference]);

  const setSkin = useCallback((next: CustomerSkin) => {
    setSkinState(next);
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, next);
    } catch {
      // best-effort only
    }
    // Restore the NEW skin's own last-used appearance preference, if one
    // was ever recorded — this is what makes the two skins' Light/Dark/
    // System choices genuinely independent rather than sharing one
    // global value that the most recent skin switch silently overwrites.
    const remembered = readAppearanceBySkin()[next];
    if (remembered) setPreference(remembered);
  }, [setPreference]);

  return (
    <CustomerSkinContext.Provider value={{ skin, setSkin }}>
      {children}
    </CustomerSkinContext.Provider>
  );
};
