import { voiceforceBaselineConfig } from './configs/voiceforce.config';
import { katonConfig } from './configs/katon.config';
import type { VoiceForceThemeConfig } from './schema';

/**
 * Session 7.12 — the client-side customer-skin lookup, mirroring
 * `.tooling/scripts/generate-theme-css.mjs`'s own `CONFIGS` map
 * byte-for-byte in shape (same two keys, same two config objects) but
 * kept as its own small file rather than imported from that script:
 * the script is a Node build tool (uses esbuild/fs), not something a
 * browser bundle should pull in. No config VALUES are duplicated here —
 * only the existing `voiceforceBaselineConfig`/`katonConfig` objects
 * (Sessions 7.3–7.11) are re-exported under a lookup key.
 */
export type CustomerSkin = 'voiceforce' | 'katon';

export const CUSTOMER_SKIN_CONFIGS: Record<CustomerSkin, VoiceForceThemeConfig> = {
  voiceforce: voiceforceBaselineConfig,
  katon: katonConfig,
};

/**
 * Session 7.12 follow-up — the Demo Skin Selector shows a color-based
 * display name instead of the internal customer config key/name
 * ("KATON"), per explicit instruction: the selector should read as a
 * presentation choice, not a customer/tenant name. Only this display
 * label changes — the underlying key stays `katon` everywhere else
 * (filename, schema customer id, every existing test/doc/script
 * reference from Sessions 7.3–7.11), since renaming the established
 * config identifier itself is a much larger, unrelated migration this
 * session is not authorized to undertake. "Azure" is KATON's own real,
 * documented primary action color (`#0A67C7`, `color.roles.primary`
 * "Buttons, links") — clearly distinct from VoiceForce's cyan
 * interactive accent used throughout this app.
 */
export const CUSTOMER_SKIN_LABELS: Record<CustomerSkin, string> = {
  voiceforce: 'VoiceForce',
  katon: 'Azure',
};

export function isCustomerSkin(value: unknown): value is CustomerSkin {
  return value === 'voiceforce' || value === 'katon';
}
