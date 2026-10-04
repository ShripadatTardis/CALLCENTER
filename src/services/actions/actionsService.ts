import { request } from '@/services/transport/httpClient';

/**
 * Session 15 — Action Required. Thin service layer over the
 * consolidated /api/admin route (`?resource=actions`) — same 12-function
 * Hobby-plan ceiling reason every other admin.ts resource exists for
 * (see adminService.ts). Authorization is server-side (requirePermission
 * + the ownership rule enforced inside the RPCs) via the Authorization:
 * Bearer header httpClient already attaches.
 */

export type ActionItemStatus = 'open' | 'in_progress' | 'resolved';

export interface ActionItem {
  id: string;
  sourceInteractionType: 'call';
  sourceInteractionId: string;
  signalType: 'escalation';
  customerId: string | null;
  agentId: string | null;
  campaignId: string | null;
  reasonCode: 'escalation_with_reason' | 'escalation_reason_unavailable';
  reasonText: string | null;
  status: ActionItemStatus;
  assignedUserId: string | null;
  assignedDisplayName: string | null;
  assignedEmail: string | null;
  resolutionCode: 'escalation_handled' | 'customer_called_back' | 'no_action_needed' | 'other' | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EligibleAssignee {
  id: string;
  email: string;
  displayName: string | null;
}

/** The reason shown to an operator — the real escalation_trigger, or an honest "unavailable" label. Never the circular "Escalated" placeholder this replaced. */
export function actionItemReasonText(item: ActionItem): string {
  return item.reasonText || 'Reason unavailable from source';
}

export async function fetchActionItems(status?: ActionItemStatus): Promise<ActionItem[]> {
  const res = await request<{ data: ActionItem[] }>('/admin', {
    query: { resource: 'actions', ...(status ? { status } : {}) },
  });
  return res.data;
}

export async function fetchActionItem(id: string): Promise<ActionItem | null> {
  const res = await request<{ data: ActionItem | null }>('/admin', {
    query: { resource: 'actions', action: 'get', id },
  });
  return res.data;
}

export async function fetchEligibleAssignees(id: string): Promise<EligibleAssignee[]> {
  const res = await request<{ data: EligibleAssignee[] }>('/admin', {
    query: { resource: 'actions', action: 'eligibleAssignees', id },
  });
  return res.data;
}

export async function takeOwnership(id: string): Promise<ActionItem> {
  const res = await request<{ data: ActionItem }>('/admin', {
    method: 'POST',
    query: { resource: 'actions', action: 'takeOwnership' },
    body: { id },
  });
  return res.data;
}

export async function assignActionItem(id: string, assigneeUserId: string): Promise<ActionItem> {
  const res = await request<{ data: ActionItem }>('/admin', {
    method: 'POST',
    query: { resource: 'actions', action: 'assign' },
    body: { id, assigneeUserId },
  });
  return res.data;
}

export async function setActionItemStatus(id: string, status: 'open' | 'in_progress'): Promise<ActionItem> {
  const res = await request<{ data: ActionItem }>('/admin', {
    method: 'POST',
    query: { resource: 'actions', action: 'setStatus' },
    body: { id, status },
  });
  return res.data;
}

export async function resolveActionItem(
  id: string,
  resolutionCode: NonNullable<ActionItem['resolutionCode']>,
  resolutionNote: string,
): Promise<ActionItem> {
  const res = await request<{ data: ActionItem }>('/admin', {
    method: 'POST',
    query: { resource: 'actions', action: 'resolve' },
    body: { id, resolutionCode, resolutionNote },
  });
  return res.data;
}
