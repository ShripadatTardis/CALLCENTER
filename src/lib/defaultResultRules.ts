import type { NewResultRuleInput } from '@/types/campaign';

/**
 * Frontend-side copy of the same conservative default rules the server
 * seeds when a campaign is created with no rules supplied
 * (src/server/campaigns/resultRules.ts's defaultResultRules) — shown
 * pre-filled in the Create Campaign result-mapping step (plan §10/§13)
 * so an operator edits real values before launch rather than an empty
 * form. The server is the actual source of truth if this list ever
 * drifts; both must stay conservative and based only on real, confirmed
 * call-data values, never a guessed business-specific default.
 */
export function defaultResultRules(): NewResultRuleInput[] {
  return [
    {
      priority: 10,
      matchField: 'escalation_trigger',
      matchValue: 'escalated',
      resultCode: 'needs_review',
      resultLabel: 'Needs manual review',
      isSuccess: false,
      nextActionType: 'escalate',
      nextActionDelayDays: null,
      active: true,
    },
    {
      priority: 20,
      matchField: 'outcome',
      matchValue: 'resolved',
      resultCode: 'resolved',
      resultLabel: 'Resolved',
      isSuccess: true,
      nextActionType: 'close',
      nextActionDelayDays: null,
      active: true,
    },
  ];
}
