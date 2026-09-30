/**
 * Session 12.4.1 — frontend mirror of
 * src/server/campaigns/inputMapping.ts's `validateMappingSourceUniqueness`.
 * Kept as a small, independently-typed duplicate rather than a direct
 * cross-boundary import, matching this codebase's existing convention of
 * a frontend-safe type file (src/types/campaign.ts) mirroring the
 * server-only one (src/server/campaigns/types.ts) rather than the UI
 * importing from src/server directly. The rule itself — a source field
 * (CSV column or Customer 360 field) may back at most one agent input,
 * keyed by `${sourceType}:${sourceField}` so identical labels across
 * different source types never collide — must stay identical on both
 * sides; the server copy is authoritative and is what actually gets
 * enforced at the persistence boundary (api/campaigns.ts).
 */
export interface MappingSourceUniquenessResult {
  valid: boolean;
  duplicateSourceKeys: string[];
}

export function validateMappingSourceUniqueness(
  mappings: Array<{ sourceType: string; sourceField: string }>,
): MappingSourceUniquenessResult {
  const counts = new Map<string, number>();
  for (const m of mappings) {
    if (!m.sourceField) continue;
    const key = `${m.sourceType}:${m.sourceField}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateSourceKeys = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  return { valid: duplicateSourceKeys.length === 0, duplicateSourceKeys };
}
