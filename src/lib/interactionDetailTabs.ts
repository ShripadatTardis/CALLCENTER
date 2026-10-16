/**
 * Session 16.5.1 — the single tab-identity type shared by both
 * `InteractionDetailDialog` (Call) and `ChatSessionDetailDialog` (Chat),
 * now that both render the same five-tab workspace. Previously this
 * lived only inside `InteractionDetailDialog.tsx` as
 * `InteractionDetailDialogTab` (still re-exported from there unchanged,
 * so every existing importer keeps working) — pulled out here so Chat
 * and the Automated QA Inspector return-navigation mechanism
 * (`automatedQaInspectorReturn.ts`) can share it without Chat importing
 * from a Call-specific component file.
 */
export type InteractionDetailTab = 'overview' | 'trace' | 'qa' | 'manualQa' | 'agent';
