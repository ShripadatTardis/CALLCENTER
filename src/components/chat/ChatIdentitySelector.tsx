import React, { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Info, Search, Settings2 } from 'lucide-react';
import { useClassification } from '@/hooks/classification/useClassification';
import { useCustomers } from '@/hooks/customers/useCustomers';
import { useCustomerDetail } from '@/hooks/customers/useCustomerDetail';
import { getCustomerDisplayLabel, maskPhoneLast4 } from '@/lib/customerDisplayLabel';
import type { SendChatMessageOptions } from '@/services/chat/chatService';

export interface ChatIdentitySelectorProps {
  isBound: boolean;
  boundAgentName: string | null;
  sessionId: string | null;
  resolvedCustomerId: string | null;
  resolvedContactId: string | null;
  /** Fires whenever the operator's selection changes enough to affect the first-turn payload. */
  onIdentityChange: (identity: SendChatMessageOptions & { displayLabel: string | null }) => void;
  /** Reset trigger — bumped by ChatConsole's "New Chat" so this component can clear its own local state. */
  resetKey: number;
}

/**
 * Session 7.1 §19 — replaces raw-ID-first Customer/Contact entry with
 * Domain -> Category -> Agent -> Customer -> Contact, reusing the same
 * authorization/classification/identity primitives as everywhere else
 * (useClassification, Customer 360's authorized search, and
 * getCustomerDisplayLabel's display_name -> CIF -> masked-phone
 * hierarchy — see docs/CALL_CENTRE_SESSION7_1_OPERATOR_UX.md §10).
 *
 * The Customer 360 internal row UUID is NEVER sent as the backend
 * `customer_id` — only an authoritative CIF (`sourceCustomerRef`, from
 * `customer_external_identities` via Session 5.2's identityResolver) is
 * ever sent as `customer_id`; if a selected customer has none, that
 * field is omitted entirely (the identity round-trips honestly, per
 * Chat_Mode_API.docx's own semantics).
 */
export const ChatIdentitySelector: React.FC<ChatIdentitySelectorProps> = ({
  isBound,
  boundAgentName,
  sessionId,
  resolvedCustomerId,
  resolvedContactId,
  onIdentityChange,
  resetKey,
}) => {
  const classification = useClassification();
  const [advancedMode, setAdvancedMode] = useState(false);

  const [categoryId, setCategoryId] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Manual/advanced fallback fields (support/testing only — §19: "must not be the normal workflow").
  const [manualCallerName, setManualCallerName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualCustomerId, setManualCustomerId] = useState('');
  const [manualContactId, setManualContactId] = useState('');

  useEffect(() => {
    setCategoryId('');
    setAgentId('');
    setCustomerSearch('');
    setDebouncedSearch('');
    setCustomerId(null);
    setSelectedPhone(null);
    setManualCallerName('');
    setManualPhone('');
    setManualCustomerId('');
    setManualContactId('');
  }, [resetKey]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(customerSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const categories = classification.data?.categories ?? [];
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const categoryAgents = useMemo(
    () =>
      (selectedCategory?.agentIds ?? [])
        .map((id) => classification.agentsById.get(id))
        .filter((a): a is { agentId: string; displayName: string } => Boolean(a)),
    [selectedCategory, classification.agentsById],
  );

  const customersQuery = useCustomers(debouncedSearch || undefined, 1);
  const customerOptions = customersQuery.data?.data ?? [];

  const selectedCustomerDetail = useCustomerDetail(customerId ?? undefined);
  const selectedCustomerSummary = customerOptions.find((c) => c.id === customerId);
  const cif = selectedCustomerDetail.data?.customer.sourceCustomerRef ?? null;
  const phoneNumbers = selectedCustomerDetail.data?.phoneNumbers ?? [];

  // Default to the first known phone once a customer's detail resolves.
  useEffect(() => {
    if (customerId && phoneNumbers.length > 0 && !selectedPhone) {
      setSelectedPhone(phoneNumbers[0]);
    }
  }, [customerId, phoneNumbers, selectedPhone]);

  const displayLabel = customerId
    ? getCustomerDisplayLabel({
        displayName: selectedCustomerDetail.data?.customer.displayName ?? selectedCustomerSummary?.displayName,
        sourceCustomerRef: cif,
        rawPrimaryPhone: selectedPhone ?? phoneNumbers[0] ?? null,
      })
    : null;

  // Push the composed identity up to ChatConsole any time a relevant input changes.
  useEffect(() => {
    if (advancedMode) {
      onIdentityChange({
        agentId: agentId || undefined,
        customerId: manualCustomerId.trim() || undefined,
        contactId: manualContactId.trim() || undefined,
        callerName: manualCallerName.trim() || undefined,
        phoneNumber: manualPhone.trim() || undefined,
        displayLabel: null,
      });
      return;
    }
    onIdentityChange({
      agentId: agentId || undefined,
      // Never the Customer 360 UUID as backend customer_id — only a real backend CIF, or omitted.
      customerId: cif ?? undefined,
      contactId: undefined,
      callerName: undefined,
      phoneNumber: selectedPhone ?? undefined,
      // Local-only linkage: retained even when there's no backend CIF,
      // so the selected Customer 360 customer isn't lost (see
      // chatService.ts / api/chat/index.ts). Never sent to the backend.
      customer360CustomerId: customerId ?? undefined,
      displayLabel,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedMode, agentId, cif, selectedPhone, manualCallerName, manualPhone, manualCustomerId, manualContactId, displayLabel]);

  if (isBound) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
        <Field label="Agent"><div className="h-8 flex items-center text-sm font-medium truncate" title={boundAgentName ?? undefined}>{boundAgentName ?? '—'}</div></Field>
        <Field label="Customer"><div className="h-8 flex items-center text-muted-foreground truncate" title={resolvedCustomerId ?? undefined}>{resolvedCustomerId ?? '—'}</div></Field>
        <Field label="Contact"><div className="h-8 flex items-center text-muted-foreground truncate" title={resolvedContactId ?? undefined}>{resolvedContactId ?? '—'}</div></Field>
        <Field label="Phone"><div className="h-8 flex items-center text-muted-foreground truncate">{selectedPhone ? maskPhoneLast4(selectedPhone) ?? selectedPhone : '—'}</div></Field>
        <Field label="Session ID"><div className="h-8 flex items-center font-mono text-xs truncate" title={sessionId ?? undefined}>{sessionId ?? '—'}</div></Field>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {advancedMode ? 'Advanced / Manual IDs (support & testing)' : 'Start a new chat'}
          </span>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAdvancedMode((v) => !v)}>
            <Settings2 className="h-3 w-3 mr-1" />
            {advancedMode ? 'Use guided selector' : 'Advanced / Manual IDs'}
          </Button>
        </div>

        {advancedMode ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Field label="Agent">
              <AgentPicker agentId={agentId} onChange={setAgentId} />
            </Field>
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
            <Field label="Session ID"><div className="h-8 flex items-center font-mono text-xs truncate">{sessionId ?? 'Not started'}</div></Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Category">
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  setCategoryId(v);
                  setAgentId('');
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={classification.isLoading ? 'Loading…' : 'Select category'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Agent">
              <Select value={agentId} onValueChange={setAgentId} disabled={!categoryId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={categoryId ? 'Select agent' : 'Pick a category first'} />
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
                    {displayLabel ?? 'Search customer (optional)'}
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
                      className="w-full text-left text-xs text-muted-foreground px-2 py-1 hover:bg-slate-50 rounded"
                      onClick={() => {
                        setCustomerId(null);
                        setSelectedPhone(null);
                        setPickerOpen(false);
                      }}
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
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50 rounded"
                        onClick={() => {
                          setCustomerId(c.id);
                          setSelectedPhone(null);
                          setPickerOpen(false);
                          setCustomerSearch('');
                        }}
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
                      <SelectItem key={p} value={p} className="text-sm">
                        {maskPhoneLast4(p) ?? p}
                      </SelectItem>
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

        {!advancedMode && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            Customer/Contact are optional — omitted entirely if not selected. Only a real backend CIF is
            ever sent as customer_id, never this app's internal customer record id.
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

const AgentPicker: React.FC<{ agentId: string; onChange: (id: string) => void }> = ({ agentId, onChange }) => {
  const classification = useClassification();
  const allAgents = Array.from(classification.agentsById.values());
  return (
    <Select value={agentId} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder="Select agent" />
      </SelectTrigger>
      <SelectContent>
        {allAgents.map((a) => (
          <SelectItem key={a.agentId} value={a.agentId} className="text-sm">{a.displayName}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
