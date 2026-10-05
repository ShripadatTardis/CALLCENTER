import type {
  CallAgentContract,
  CampaignAgentInputMapping,
  CampaignConfigurationVersion,
  OutcomePolicySnapshot,
} from '@/types/campaign';

/**
 * Session 13.4 (DEC-CAMP-01) — pure, deterministic helpers that turn the
 * already-fetched configuration-version rows (Session 12.7) and the
 * campaign's full (cross-version) mapping row set into a per-version
 * read model, plus a structural diff between consecutive versions.
 *
 * No AI/LLM summarization anywhere here — every diff entry is a direct
 * structural comparison of the real snapshot data, and an unchanged
 * field is never reported as changed (the loop below only pushes an
 * entry when the two sides are provably different).
 */

export interface ConfigurationVersionView {
  /** The real row id, or the literal 'current' for the synthetic v1 built when a campaign has never been versioned yet. */
  id: string;
  versionNumber: number;
  status: 'active' | 'superseded';
  agentId: string;
  agentName: string | null;
  agentContractSnapshot: CallAgentContract | null;
  outcomePolicySnapshot: OutcomePolicySnapshot | null;
  /** Only this version's own mapping rows (filtered from the campaign's full, cross-version row set by configurationVersionId). */
  mappings: CampaignAgentInputMapping[];
  createdAt: string;
  createdBy: string | null;
  changeReason: string | null;
  /** True only for the synthetic "v1 (current)" view — a campaign that has never been edited since launch has no real campaign_configuration_versions row at all. */
  isSynthetic: boolean;
}

/**
 * Session 15.2 (correctness fix) — selects only the mapping rows that
 * belong to one specific configuration version (or the never-versioned
 * "current" set when versionId is null) out of the campaign's full
 * cross-version mapping row history. The one place this MUST be used
 * before treating a campaign's mapping rows as "the current mapping":
 * campaign.mappings itself is never pre-filtered — it is every mapping
 * row ever inserted across every configuration version, intentionally,
 * so buildConfigurationVersionViews below can reconstruct each
 * version's own mappings for Configuration History. Any other consumer
 * that needs "the mappings that currently govern this campaign" (e.g.
 * CampaignSettingsDialog seeding its edit form) must filter through
 * this function first, keyed by the same governing version id already
 * used for optimistic-concurrency (expectedCurrentVersionId) — never
 * assume the last entry in array order is the current one.
 */
export function selectCurrentVersionMappings(
  allMappings: CampaignAgentInputMapping[],
  currentVersionId: string | null,
): CampaignAgentInputMapping[] {
  return allMappings.filter((m) => m.configurationVersionId === currentVersionId);
}

/**
 * Groups the campaign's full (unfiltered, cross-version) mapping row
 * set by configurationVersionId and pairs each group with its version
 * row. When the campaign has never been versioned (no rows at all —
 * still a draft, or launched but never edited since 12.7 shipped),
 * synthesizes a single "v1 (current)" view from the campaign's own
 * current columns and the mapping rows whose configurationVersionId is
 * still null (never backfilled) — never fabricated data, only a
 * relabeling of what the campaign's current state already is.
 */
export function buildConfigurationVersionViews(
  versions: CampaignConfigurationVersion[],
  allMappings: CampaignAgentInputMapping[],
  current: {
    agentId: string;
    agentName: string | null;
    agentContractSnapshot: CallAgentContract | null;
    outcomePolicySnapshot: OutcomePolicySnapshot | null;
    createdAt: string;
    createdBy: string | null;
  },
): ConfigurationVersionView[] {
  if (versions.length === 0) {
    return [
      {
        id: 'current',
        versionNumber: 1,
        status: 'active',
        agentId: current.agentId,
        agentName: current.agentName,
        agentContractSnapshot: current.agentContractSnapshot,
        outcomePolicySnapshot: current.outcomePolicySnapshot,
        mappings: selectCurrentVersionMappings(allMappings, null),
        createdAt: current.createdAt,
        createdBy: current.createdBy,
        changeReason: null,
        isSynthetic: true,
      },
    ];
  }
  return [...versions]
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      agentId: v.agentId,
      agentName: v.agentName,
      agentContractSnapshot: v.agentContractSnapshot,
      outcomePolicySnapshot: v.outcomePolicySnapshot,
      mappings: selectCurrentVersionMappings(allMappings, v.id),
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      changeReason: v.changeReason,
      isSynthetic: false,
    }));
}

export interface ConfigurationDiffEntry {
  area: 'agent' | 'contract' | 'inputMapping' | 'outcomeMapping';
  description: string;
}

function contractSignature(contract: CallAgentContract | null): string {
  if (!contract) return 'none';
  const inputs = contract.expectedInputFields.map((f) => `${f.fieldCode}:${f.dataType ?? ''}:${f.required}`).sort();
  const outcomes = contract.expectedOutcomes.map((o) => o.outcomeCode).sort();
  const outputs = contract.outputFields.map((f) => `${f.fieldCode}:${f.dataType ?? ''}`).sort();
  return JSON.stringify({ inputs, outcomes, outputs });
}

function mappingKey(m: Pick<CampaignAgentInputMapping, 'sourceType' | 'sourceField'>): string {
  return `${m.sourceType}:${m.sourceField}`;
}

/**
 * A structural diff between one version and the version immediately
 * before it (by versionNumber, not an AI-written summary). Returns []
 * when prev is null (nothing to compare the first version against) or
 * when every compared field is genuinely identical.
 */
export function diffConfigurationVersions(
  prev: ConfigurationVersionView | null,
  curr: ConfigurationVersionView,
): ConfigurationDiffEntry[] {
  if (!prev) return [];
  const entries: ConfigurationDiffEntry[] = [];

  if (prev.agentId !== curr.agentId) {
    entries.push({
      area: 'agent',
      description: `Agent changed: ${prev.agentName ?? prev.agentId} → ${curr.agentName ?? curr.agentId}`,
    });
  }

  if (contractSignature(prev.agentContractSnapshot) !== contractSignature(curr.agentContractSnapshot)) {
    const p = prev.agentContractSnapshot;
    const c = curr.agentContractSnapshot;
    entries.push({
      area: 'contract',
      description: `Agent Contract changed (inputs ${p?.expectedInputFields.length ?? 0}→${c?.expectedInputFields.length ?? 0}, outcomes ${p?.expectedOutcomes.length ?? 0}→${c?.expectedOutcomes.length ?? 0}, outputs ${p?.outputFields.length ?? 0}→${c?.outputFields.length ?? 0})`,
    });
  }

  const prevByField = new Map(prev.mappings.map((m) => [m.agentInputFieldCode, m]));
  const currByField = new Map(curr.mappings.map((m) => [m.agentInputFieldCode, m]));
  for (const fieldCode of Array.from(new Set([...prevByField.keys(), ...currByField.keys()])).sort()) {
    const p = prevByField.get(fieldCode);
    const c = currByField.get(fieldCode);
    if (p && !c) {
      entries.push({ area: 'inputMapping', description: `Input Mapping removed: ${fieldCode}` });
    } else if (!p && c) {
      entries.push({ area: 'inputMapping', description: `Input Mapping added: ${fieldCode} (${mappingKey(c)})` });
    } else if (p && c && mappingKey(p) !== mappingKey(c)) {
      entries.push({ area: 'inputMapping', description: `Input Mapping changed: ${fieldCode} (${mappingKey(p)} → ${mappingKey(c)})` });
    }
  }

  const prevByOutcome = new Map((prev.outcomePolicySnapshot?.mappings ?? []).map((m) => [m.agentOutcomeCode, m]));
  const currByOutcome = new Map((curr.outcomePolicySnapshot?.mappings ?? []).map((m) => [m.agentOutcomeCode, m]));
  for (const outcomeCode of Array.from(new Set([...prevByOutcome.keys(), ...currByOutcome.keys()])).sort()) {
    const p = prevByOutcome.get(outcomeCode);
    const c = currByOutcome.get(outcomeCode);
    if (p && !c) {
      entries.push({ area: 'outcomeMapping', description: `Outcome Mapping removed: ${outcomeCode}` });
    } else if (!p && c) {
      entries.push({ area: 'outcomeMapping', description: `Outcome Mapping added: ${outcomeCode} → ${c.campaignClassificationCode}` });
    } else if (p && c && p.campaignClassificationCode !== c.campaignClassificationCode) {
      entries.push({
        area: 'outcomeMapping',
        description: `Outcome Mapping changed: ${outcomeCode} (${p.campaignClassificationCode} → ${c.campaignClassificationCode})`,
      });
    }
  }

  return entries;
}
