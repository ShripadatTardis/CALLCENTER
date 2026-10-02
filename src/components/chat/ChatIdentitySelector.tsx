import React, { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Info, Search, Settings2 } from 'lucide-react';
import { useClassification } from '@/hooks/classification/useClassification';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCustomers } from '@/hooks/customers/useCustomers';
import { useCustomerDetail } from '@/hooks/customers/useCustomerDetail';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { useCampaignTargets } from '@/hooks/campaigns/useCampaignDetail';
import { getCustomerDisplayLabel, maskPhoneLast4 } from '@/lib/customerDisplayLabel';
import type { SendChatMessageOptions } from '@/services/chat/chatService';
import type { AgentSummary } from '@/services/agents/agentsMapper';

export interface ChatIdentitySelectorProps {
  isBound: boolean;
  boundAgentName: string | null;
  sessionId: string | null;
  resolvedCustomerId: string | null;
  resolvedContactId: string | null;
  /** Session 11.9A — the campaign this bound session started from, if any (display only). */
  boundCampaignName: string | null;
  /** Session 11.9B — whether this bound session is Trial/Test (display only, for visible isolation). */
  boundIsTrial: boolean;
  /** Fires whenever the operator's selection changes enough to affect the first-turn payload. */
  onIdentityChange: (identity: SendChatMessageOptions & { displayLabel: string | null }) => void;
  /** Reset trigger — bumped by ChatConsole's "New Chat" so this component can clear its own local state. */
  resetKey: number;
}

type InitiationMode = 'standalone' | 'campaign' | 'trial';

/**
 * Session 11.9A/11.9B — Integrated Initiate Chat. Chat is a CHANNEL of
 * VoiceForce's single customer-engagement model, not an independent
 * AI-chat utility:
 *
 *   Customer 360 -> Campaign/Operational Context -> Call Agent -> Interaction -> Result/Follow-up
 *
 * Three initiation modes, matching the approved Initiate Call model:
 *   - Standalone Customer: Customer -> Contact -> Agent -> Review
 *   - Campaign Customer:   Campaign -> Customer (that campaign's real
 *     audience only) -> Agent (the campaign's own immutable agent_id,
 *     never substituted) -> Review
 *   - Trial / Test: Agent -> optional manual identity -> Review — the
 *     only mode where Advanced/Manual IDs lives, so it never competes
 *     with the production Standalone/Campaign workflow.
 *
 * Category (Session 6.2's classification tree) remains available as an
 * OPTIONAL Agent filter in Standalone/Trial — it no longer defines the
 * journey the way the old Category-first selector did.
 *
 * The CIF-vs-internal-UUID safety rule from Session 11.9 is preserved
 * exactly: only a real backend CIF (sourceCustomerRef, resolved via
 * Customer 360) is ever sent as the backend `customer_id`; the internal
 * Customer 360 row UUID travels only as the separately-named,
 * never-forwarded `customer360CustomerId`.
 *
 * Session 11.9B — a self-audit of 11.9A found that entering Chat into
 * the Voice-only campaign_executions/reconciliation lifecycle was
 * unsafe (docs/SESSION_11_9B_INTEGRATED_CHAT_PERSISTENCE.md). Campaign
 * Customer mode now carries `campaignId`/`campaignTargetId` straight
 * through to Chat's own session persistence — a real link to the
 * selected target, never a Voice execution row. Trial/Test mode always
 * sets `isTrial: true`, independent of whatever manual identity fields
 * are filled in — this is what actually keeps a Trial chat out of
 * Customer 360/campaign production history, not merely the absence of
 * automatic correlation.
 */
export const ChatIdentitySelector: React.FC<ChatIdentitySelectorProps> = ({
  isBound,
  boundAgentName,
  sessionId,
  resolvedCustomerId,
  resolvedContactId,
  boundCampaignName,
  boundIsTrial,
  onIdentityChange,
  resetKey,
}) => {
  const [mode, setMode] = useState<InitiationMode>('standalone');

  // Standalone
  const [categoryId, setCategoryId] = useState<string>('');
  const [standaloneAgentId, setStandaloneAgentId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Campaign
  const [campaignId, setCampaignId] = useState<string>('');
  const [campaignTargetId, setCampaignTargetId] = useState<string>('');
  const [campaignCustomerSearch, setCampaignCustomerSearch] = useState('');

  // Trial / Test
  const [trialAgentId, setTrialAgentId] = useState<string>('');
  const [advancedMode, setAdvancedMode] = useState(false);
  const [manualCallerName, setManualCallerName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualCustomerId, setManualCustomerId] = useState('');
  const [manualContactId, setManualContactId] = useState('');

  useEffect(() => {
    setMode('standalone');
    setCategoryId('');
    setStandaloneAgentId('');
    setCustomerSearch('');
    setDebouncedSearch('');
    setCustomerId(null);
    setSelectedPhone(null);
    setCampaignId('');
    setCampaignTargetId('');
    setCampaignCustomerSearch('');
    setTrialAgentId('');
    setAdvancedMode(false);
    setManualCallerName('');
    setManualPhone('');
    setManualCustomerId('');
    setManualContactId('');
  }, [resetKey]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(customerSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const classification = useClassification();
  const agentsQuery = useAgents();
  const allAgents = useMemo(() => agentsQuery.data?.agents ?? [], [agentsQuery.data]);

  const categories = classification.data?.categories ?? [];
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const categoryAgents = useMemo(
    () =>
      categoryId
        ? (selectedCategory?.agentIds ?? [])
            .map((id) => classification.agentsById.get(id))
            .filter((a): a is AgentSummary => Boolean(a))
        : allAgents,
    [categoryId, selectedCategory, classification.agentsById, allAgents],
  );

  // --- Standalone customer/contact resolution ---
  const customersQuery = useCustomers(debouncedSearch || undefined, 1);
  const customerOptions = customersQuery.data?.data ?? [];
  const selectedCustomerDetail = useCustomerDetail(customerId ?? undefined);
  const selectedCustomerSummary = customerOptions.find((c) => c.id === customerId);
  const cif = selectedCustomerDetail.data?.customer.sourceCustomerRef ?? null;
  const phoneNumbers = selectedCustomerDetail.data?.phoneNumbers ?? [];

  useEffect(() => {
    if (mode === 'standalone' && customerId && phoneNumbers.length > 0 && !selectedPhone) {
      setSelectedPhone(phoneNumbers[0]);
    }
  }, [mode, customerId, phoneNumbers, selectedPhone]);

  const standaloneDisplayLabel = customerId
    ? getCustomerDisplayLabel({
        displayName: selectedCustomerDetail.data?.customer.displayName ?? selectedCustomerSummary?.displayName,
        sourceCustomerRef: cif,
        rawPrimaryPhone: selectedPhone ?? phoneNumbers[0] ?? null,
      })
    : null;

  // --- Campaign audience/target resolution ---
  const campaignsQuery = useCampaigns({ pageSize: 100 });
  const campaigns = campaignsQuery.data?.data ?? [];
  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const campaignTargetsQuery = useCampaignTargets(campaignId || undefined, { pageSize: 200 });
  const campaignTargets = useMemo(() => campaignTargetsQuery.data?.data ?? [], [campaignTargetsQuery.data]);
  const filteredCampaignTargets = useMemo(() => {
    const q = campaignCustomerSearch.trim().toLowerCase();
    if (!q) return campaignTargets;
    return campaignTargets.filter(
      (t) => (t.customerDisplayName ?? '').toLowerCase().includes(q) || t.contactRawValue.includes(q),
    );
  }, [campaignTargets, campaignCustomerSearch]);
  const selectedTarget = campaignTargets.find((t) => t.id === campaignTargetId);
  // The campaign audience is Customer 360 customers by construction
  // (campaign_targets.customer_id is a real FK — Session 11.5A) — this
  // Customer 360 lookup resolves the SAME real CIF the standalone path
  // does, never a second identity source.
  const campaignCustomerDetail = useCustomerDetail(selectedTarget?.customerId ?? undefined);
  const campaignCif = campaignCustomerDetail.data?.customer.sourceCustomerRef ?? null;
  const campaignDisplayLabel = selectedTarget
    ? getCustomerDisplayLabel({
        displayName: selectedTarget.customerDisplayName ?? campaignCustomerDetail.data?.customer.displayName,
        sourceCustomerRef: campaignCif,
        rawPrimaryPhone: selectedTarget.contactRawValue,
      })
    : null;

  // --- Push the composed identity up to ChatConsole any time a relevant input changes ---
  useEffect(() => {
    if (mode === 'trial') {
      // isTrial: true unconditionally — this is what actually isolates
      // a Trial chat from Customer 360/campaign analytics (Session
      // 11.9B), independent of whether manual identity fields below are
      // populated with real-looking values.
      if (advancedMode) {
        onIdentityChange({
          agentId: trialAgentId || undefined,
          customerId: manualCustomerId.trim() || undefined,
          contactId: manualContactId.trim() || undefined,
          callerName: manualCallerName.trim() || undefined,
          phoneNumber: manualPhone.trim() || undefined,
          isTrial: true,
          displayLabel: null,
        });
      } else {
        onIdentityChange({ agentId: trialAgentId || undefined, isTrial: true, displayLabel: null });
      }
      return;
    }

    if (mode === 'campaign') {
      onIdentityChange({
        agentId: selectedCampaign?.agentId || undefined,
        // Never the Customer 360 UUID as backend customer_id — only a real backend CIF, or omitted.
        customerId: campaignCif ?? undefined,
        phoneNumber: selectedTarget?.contactRawValue ?? undefined,
        customer360CustomerId: selectedTarget?.customerId ?? undefined,
        // Session 11.9B — a real link to the selected campaign/target,
        // persisted directly on the Chat session (never a Voice
        // campaign_executions row — see this file's top-of-file comment).
        campaignId: campaignId || undefined,
        campaignTargetId: campaignTargetId || undefined,
        campaignName: selectedCampaign?.name,
        displayLabel: campaignDisplayLabel,
      });
      return;
    }

    // standalone
    onIdentityChange({
      agentId: standaloneAgentId || undefined,
      customerId: cif ?? undefined,
      phoneNumber: selectedPhone ?? undefined,
      customer360CustomerId: customerId ?? undefined,
      displayLabel: standaloneDisplayLabel,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    standaloneAgentId,
    cif,
    selectedPhone,
    customerId,
    campaignId,
    campaignTargetId,
    campaignCif,
    selectedCampaign,
    selectedTarget,
    campaignDisplayLabel,
    trialAgentId,
    advancedMode,
    manualCallerName,
    manualPhone,
    manualCustomerId,
    manualContactId,
  ]);

  if (isBound) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-muted rounded-lg border border-border text-sm">
        <Field label="Agent"><div className="h-8 flex items-center text-sm font-medium truncate" title={boundAgentName ?? undefined}>{boundAgentName ?? '—'}</div></Field>
        <Field label="Customer"><div className="h-8 flex items-center text-muted-foreground truncate" title={resolvedCustomerId ?? undefined}>{resolvedCustomerId ?? '—'}</div></Field>
        <Field label="Contact"><div className="h-8 flex items-center text-muted-foreground truncate" title={resolvedContactId ?? undefined}>{resolvedContactId ?? '—'}</div></Field>
        <Field label={boundIsTrial ? 'Mode' : boundCampaignName ? 'Campaign' : 'Channel'}>
          <div className="h-8 flex items-center text-muted-foreground truncate">
            {boundIsTrial ? (
              <Badge variant="outline" className="border-amber-600/50 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:text-amber-400">
                Trial / Test
              </Badge>
            ) : (
              boundCampaignName ?? 'Chat'
            )}
          </div>
        </Field>
        <Field label="Session ID"><div className="h-8 flex items-center font-mono text-xs truncate" title={sessionId ?? undefined}>{sessionId ?? '—'}</div></Field>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-2.5 p-3 bg-muted rounded-lg border border-border text-sm">
        <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
          <ModeTab label="Standalone Customer" active={mode === 'standalone'} onClick={() => setMode('standalone')} />
          <ModeTab label="Campaign Customer" active={mode === 'campaign'} onClick={() => setMode('campaign')} />
          <ModeTab label="Trial / Test" active={mode === 'trial'} onClick={() => setMode('trial')} />
        </div>

        {mode === 'standalone' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Category (optional filter)">
              <Select value={categoryId || '__all__'} onValueChange={(v) => { setCategoryId(v === '__all__' ? '' : v); setStandaloneAgentId(''); }}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={classification.isLoading ? 'Loading…' : 'All agents'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-sm">All agents</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Agent">
              <Select value={standaloneAgentId} onValueChange={setStandaloneAgentId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {categoryAgents.map((a) => (
                    <SelectItem key={a.agentId} value={a.agentId} className="text-sm">{a.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Customer">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 w-full justify-start text-sm font-normal truncate">
                    <Search className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                    {standaloneDisplayLabel ?? 'Search customer (optional)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <Input
                    autoFocus
                    placeholder="Name, CIF, or phone…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="h-8 text-sm mb-2"
                  />
                  {customerId && (
                    <button
                      type="button"
                      className="w-full text-left text-xs text-muted-foreground px-2 py-1 hover:bg-muted rounded"
                      onClick={() => { setCustomerId(null); setSelectedPhone(null); setPickerOpen(false); }}
                    >
                      Clear selection
                    </button>
                  )}
                  <div className="max-h-56 overflow-y-auto">
                    {customersQuery.isLoading && <p className="text-xs text-muted-foreground px-2 py-2">Searching…</p>}
                    {!customersQuery.isLoading && debouncedSearch && customerOptions.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-2">No authorized customers match.</p>
                    )}
                    {customerOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded"
                        onClick={() => { setCustomerId(c.id); setSelectedPhone(null); setPickerOpen(false); setCustomerSearch(''); }}
                      >
                        {getCustomerDisplayLabel({
                          displayName: c.displayName,
                          sourceCustomerRef: c.sourceCustomerRef,
                          primaryPhoneMasked: c.primaryPhoneMasked,
                        })}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Contact">
              {customerId && phoneNumbers.length > 0 ? (
                <Select value={selectedPhone ?? phoneNumbers[0]} onValueChange={setSelectedPhone}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {phoneNumbers.map((p) => (
                      <SelectItem key={p} value={p} className="text-sm">{maskPhoneLast4(p) ?? p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-8 flex items-center text-muted-foreground text-xs">
                  {customerId ? 'No known contact' : 'Select a customer first'}
                </div>
              )}
            </Field>
          </div>
        )}

        {mode === 'campaign' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Campaign">
                <Select
                  value={campaignId}
                  onValueChange={(v) => { setCampaignId(v); setCampaignTargetId(''); setCampaignCustomerSearch(''); }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={campaignsQuery.isLoading ? 'Loading…' : 'Select campaign'} />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Agent (campaign-bound)">
                <div className="h-8 flex items-center text-sm truncate text-muted-foreground" title={selectedCampaign?.agentId}>
                  {selectedCampaign ? (selectedCampaign.agentName ?? selectedCampaign.agentId) : '—'}
                </div>
              </Field>
            </div>

            <Field label={campaignId ? 'Customer (this campaign’s audience)' : 'Customer'}>
              {!campaignId ? (
                <div className="h-8 flex items-center text-muted-foreground text-xs">Select a campaign first</div>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    placeholder="Filter this campaign's audience…"
                    value={campaignCustomerSearch}
                    onChange={(e) => setCampaignCustomerSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background">
                    {campaignTargetsQuery.isLoading && <p className="text-xs text-muted-foreground px-2 py-2">Loading audience…</p>}
                    {!campaignTargetsQuery.isLoading && filteredCampaignTargets.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-2">No matching targets in this campaign's audience.</p>
                    )}
                    {filteredCampaignTargets.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`w-full text-left px-2 py-1.5 text-sm hover:bg-muted ${t.id === campaignTargetId ? 'bg-muted font-medium' : ''}`}
                        onClick={() => setCampaignTargetId(t.id)}
                      >
                        {t.customerDisplayName ?? maskPhoneLast4(t.contactRawValue) ?? t.contactRawValue}
                        <span className="ml-2 text-xs text-muted-foreground">attempt {t.attemptCount + 1}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Field>
          </div>
        )}

        {mode === 'trial' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Trial / Test — excluded from Customer 360 and campaign analytics</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAdvancedMode((v) => !v)}>
                <Settings2 className="h-3 w-3 mr-1" />
                {advancedMode ? 'Hide manual identity' : 'Add manual test identity'}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Agent">
                <Select value={trialAgentId} onValueChange={setTrialAgentId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select agent (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {allAgents.map((a) => (
                      <SelectItem key={a.agentId} value={a.agentId} className="text-sm">{a.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {advancedMode && (
                <>
                  <Field label="Customer ID">
                    <Input value={manualCustomerId} onChange={(e) => setManualCustomerId(e.target.value)} placeholder="CIF (optional)" className="h-8 text-sm" />
                  </Field>
                  <Field label="Contact ID">
                    <Input value={manualContactId} onChange={(e) => setManualContactId(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
                  </Field>
                  <Field label="Caller Name / Phone">
                    <div className="flex gap-1">
                      <Input value={manualCallerName} onChange={(e) => setManualCallerName(e.target.value)} placeholder="Name" className="h-8 text-sm" />
                      <Input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="Phone" className="h-8 text-sm" />
                    </div>
                  </Field>
                </>
              )}
            </div>
          </div>
        )}

        {/* Review — compact resolved context before starting */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          <span className="text-[11px] text-muted-foreground mr-1">Review:</span>
          <Badge variant="outline" className="text-xs font-normal">
            {mode === 'campaign' ? campaignDisplayLabel ?? 'No customer selected' : mode === 'standalone' ? standaloneDisplayLabel ?? 'No customer selected' : 'Test — no Customer 360 customer'}
          </Badge>
          {mode === 'campaign' && selectedCampaign && (
            <Badge variant="outline" className="text-xs font-normal">Campaign: {selectedCampaign.name}</Badge>
          )}
          <Badge variant="outline" className="text-xs font-normal">
            Agent: {(mode === 'campaign' ? selectedCampaign?.agentName ?? selectedCampaign?.agentId : mode === 'trial' ? allAgents.find((a) => a.agentId === trialAgentId)?.displayName : allAgents.find((a) => a.agentId === standaloneAgentId)?.displayName) ?? 'Default'}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal">Channel: Chat</Badge>
        </div>

        {mode !== 'trial' && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            Only a real backend CIF is ever sent as customer_id — never this app's internal customer record id.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <div className="text-xs text-muted-foreground">{label}</div>
    {children}
  </div>
);

const ModeTab: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-7 px-2.5 rounded text-xs font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
    }`}
  >
    {label}
  </button>
);
