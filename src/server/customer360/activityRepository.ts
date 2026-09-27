/**
 * Session 11.5A workstream D — Customer Activity / Diary
 * (docs/VOICEFORCE_CUSTOMER_360_INITIATE_CALL_DESIGN_v1.docx §6/§9/§9.1).
 *
 * A genuine new generic capability — structured Note/Instruction/Task/
 * Reminder/Appointment records, not a mutable 'notes' blob on
 * `customers`. Nothing in this file depends on Supabase or Vercel —
 * only supabaseActivityRepository.ts (the current deployment adapter)
 * does, mirroring customerRepository.ts/campaignRepository.ts's own
 * interface-vs-adapter split.
 *
 * Instructions are human operational information (design doc §6): they
 * must never be injected into a Call Agent prompt or sent to any LLM —
 * nothing in this domain layer, its adapter, or any caller does that.
 *
 * KNOWN DEVIATION from the design doc's §9.1 proposal, flagged
 * explicitly (not silently upgraded): assignedUserId/assignedTeamId/
 * createdBy/updatedBy are plain client-supplied strings, not a foreign
 * key to a real users/teams table — this app has none (same limitation
 * already documented for role, api/_customer360.ts's getClientSuppliedRole,
 * and already the exact precedent Campaign.createdBy uses, api/campaigns.ts).
 * A real user/team model is a prerequisite for enforceable
 * assignment-based authorization; until then, "assignment" here is
 * advisory display text, not an access boundary.
 */

export type ActivityType = 'note' | 'instruction' | 'task' | 'reminder' | 'appointment';
export type ActivityStatus = 'active' | 'open' | 'completed' | 'cancelled' | 'inactive';

export interface CustomerActivity {
  id: string;
  customerId: string;
  activityType: ActivityType;
  title: string | null;
  body: string;
  status: ActivityStatus;
  priority: string | null;
  scheduledAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  campaignId: string | null;
  campaignTargetId: string | null;
  interactionId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
}

export interface NewCustomerActivityInput {
  customerId: string;
  activityType: ActivityType;
  title: string | null;
  body: string;
  priority?: string | null;
  scheduledAt?: string | null;
  dueAt?: string | null;
  assignedUserId?: string | null;
  assignedTeamId?: string | null;
  campaignId?: string | null;
  campaignTargetId?: string | null;
  interactionId?: string | null;
  /** Client-claimed only — see the file-level KNOWN DEVIATION note. */
  createdBy: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
}

export interface ActivityRepository {
  createActivity(input: NewCustomerActivityInput, now: string): Promise<CustomerActivity>;

  /**
   * Full chronological activity feed for one customer, or — with
   * activeInstructionsOnly — exactly the "Active Instructions" surface
   * the design doc's Customer Detail wireframe (§4.2) and future
   * Initiate Call (§7.2) both need. Unpaginated: per-customer activity
   * volume is expected to stay small, same reasoning as
   * CampaignRepository.listCustomerTargets.
   */
  listActivitiesForCustomer(customerId: string, opts?: { activeInstructionsOnly?: boolean }): Promise<CustomerActivity[]>;

  updateActivityStatus(activityId: string, status: ActivityStatus, updatedBy: string | null, now: string): Promise<CustomerActivity>;
}
