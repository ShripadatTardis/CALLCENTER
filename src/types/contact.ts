/**
 * Type-only stub for the operational customer/contact concept defined
 * in docs/GLT_CALL_CENTRE_PHASE1_AI_NATIVE_SCOPE.md §3.7. Session 4
 * builds the actual contacts service/screen on top of this — Session 1
 * only establishes the shape so that work doesn't have to invent it
 * from scratch or reconcile a different optionality convention than
 * `Interaction.customerId` (see src/types/interaction.ts).
 *
 * No service, fetch logic, or screen exists for this yet.
 */
export interface OperationalContact {
  /** Primary operational identity — always present. */
  phoneNumber: string;
  /** External CRM/customer ID, when known. Mirrors Interaction.customerId's optionality. */
  customerId?: string;
  displayName?: string;
}
