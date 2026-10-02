import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Loader2, Plus, X } from 'lucide-react';
import { useCampaignSkipReasons } from '@/hooks/campaigns/useCampaigns';
import { useCampaignActions } from '@/hooks/campaigns/useCampaignActions';
import type { CampaignTargetRow } from '@/types/campaign';

interface TargetActionsMenuProps {
  campaignId: string;
  target: CampaignTargetRow;
}

/**
 * Session 12.7 §8/§9/§10 — Skip / Hold / Release Hold / Amend, grouped
 * into one compact "More" menu per target row rather than four more
 * always-visible buttons (CampaignDetail's Actions column already has
 * Transcript/Agent Result/Retry — this avoids redesigning that table
 * for the new controls, per the session's UI-standards requirement).
 * Every item is state-aware: an action never appears when the
 * target's current status makes it invalid, matching the same
 * eligibility the backing RPCs themselves enforce.
 */
export const TargetActionsMenu: React.FC<TargetActionsMenuProps> = ({ campaignId, target }) => {
  const actions = useCampaignActions(campaignId);
  const [dialog, setDialog] = useState<'skip' | 'hold' | 'amend' | null>(null);

  const canSkip = ['pending', 'ready', 'follow_up_due'].includes(target.status);
  const canHold = ['pending', 'ready', 'follow_up_due'].includes(target.status);
  const canReleaseHold = target.status === 'held';
  const canAmend = ['pending', 'ready', 'follow_up_due', 'failed', 'held'].includes(target.status);

  if (!canSkip && !canHold && !canReleaseHold && !canAmend) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="More target actions">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canSkip && <DropdownMenuItem onClick={() => setDialog('skip')}>Skip target</DropdownMenuItem>}
          {canHold && <DropdownMenuItem onClick={() => setDialog('hold')}>Hold target</DropdownMenuItem>}
          {canReleaseHold && (
            <DropdownMenuItem
              onClick={() => actions.releaseHold.mutate(target.id)}
              disabled={actions.releaseHold.isPending}
            >
              Release hold
            </DropdownMenuItem>
          )}
          {canAmend && <DropdownMenuItem onClick={() => setDialog('amend')}>Amend target data</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === 'skip' && (
        <SkipTargetDialog
          targetId={target.id}
          isPending={actions.skip.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(reasonCode, comment) =>
            actions.skip.mutateAsync({ targetId: target.id, reasonCode, comment }).then(() => setDialog(null))
          }
        />
      )}
      {dialog === 'hold' && (
        <HoldTargetDialog
          isPending={actions.hold.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(reason, note) =>
            actions.hold.mutateAsync({ targetId: target.id, reason, note }).then(() => setDialog(null))
          }
        />
      )}
      {dialog === 'amend' && (
        <AmendTargetDialog
          currentAttributes={target.sourceAttributes}
          originalAttributes={target.originalSourceAttributes}
          isPending={actions.amend.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={(sourceAttributes, reason) =>
            actions.amend.mutateAsync({ targetId: target.id, sourceAttributes, reason }).then(() => setDialog(null))
          }
        />
      )}
    </>
  );
};

const SkipTargetDialog: React.FC<{
  targetId: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (reasonCode: string, comment: string | null) => void;
}> = ({ isPending, onCancel, onConfirm }) => {
  const { data: reasons = [], isLoading } = useCampaignSkipReasons();
  const [reasonCode, setReasonCode] = useState('');
  const [comment, setComment] = useState('');
  const selected = reasons.find((r) => r.code === reasonCode);
  const needsComment = selected?.requiresComment ?? false;
  const canConfirm = Boolean(reasonCode) && (!needsComment || comment.trim().length > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Skip target</DialogTitle>
          <DialogDescription className="text-xs">
            Skipped targets are excluded from future calls. This is distinct from a business result — it never
            affects the campaign's success rate.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="skip-reason-select" className="text-xs font-medium text-foreground">
          Reason
        </label>
        <Select value={reasonCode} onValueChange={setReasonCode} disabled={isLoading}>
          <SelectTrigger id="skip-reason-select" aria-required="true">
            <SelectValue placeholder="Select a reason…" />
          </SelectTrigger>
          <SelectContent>
            {reasons.map((r) => (
              <SelectItem key={r.code} value={r.code}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsComment && (
          <>
            <label htmlFor="skip-comment-textarea" className="text-xs font-medium text-foreground">
              Comment (required for "{selected?.label}")
            </label>
            <Textarea
              id="skip-comment-textarea"
              autoFocus
              required
              aria-required="true"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button disabled={!canConfirm || isPending} onClick={() => onConfirm(reasonCode, comment.trim() || null)}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Skip target
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const HoldTargetDialog: React.FC<{
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string | null, note: string | null) => void;
}> = ({ isPending, onCancel, onConfirm }) => {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hold target</DialogTitle>
          <DialogDescription className="text-xs">
            Excludes this target from calls until released. Distinct from pausing the whole campaign — no resume
            date is scheduled; release it manually when ready.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="hold-reason-textarea" className="text-xs font-medium text-foreground">
          Reason
        </label>
        <Textarea id="hold-reason-textarea" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[50px] text-sm" />
        <label htmlFor="hold-note-textarea" className="text-xs font-medium text-foreground">
          Note (optional)
        </label>
        <Textarea id="hold-note-textarea" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[50px] text-sm" />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button disabled={isPending} onClick={() => onConfirm(reason.trim() || null, note.trim() || null)}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Hold target
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** A single amendable field: its (immutable, never user-editable) name, its original imported value if known, and its current editable value. */
interface AmendRow {
  key: string;
  original: string | undefined;
  value: string;
  isNew: boolean;
}

function stringifyAttr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/**
 * Builds the editable row set from the target's current effective
 * attributes plus (if this target has been amended before) its
 * preserved original ones. A target never amended before has
 * originalAttributes === null — in that case current IS the
 * original, so nothing shows as "changed" yet (matches the backend:
 * original_source_attributes is only backfilled the first time an
 * amendment happens).
 */
function buildAmendRows(current: Record<string, unknown>, original: Record<string, unknown> | null): AmendRow[] {
  const baseline = original ?? current;
  const keys = Array.from(new Set([...Object.keys(current), ...Object.keys(baseline)]));
  return keys.map((key) => ({
    key,
    original: key in baseline ? stringifyAttr(baseline[key]) : undefined,
    value: key in current ? stringifyAttr(current[key]) : (original && key in baseline ? stringifyAttr(baseline[key]) : ''),
    isNew: !(key in baseline),
  }));
}

/**
 * Session 12.7 continuation — field-by-field editor, replacing a raw
 * JSON textarea. The JSON version let an operator accidentally rename
 * a field key (creating a duplicate/orphaned attribute the agent
 * would never read) with no guard against it. Here every existing
 * field's NAME is a fixed label, never an editable input — only its
 * value can change — so that mistake is structurally impossible. New
 * fields can be added (name + value together, once, at creation) but
 * still can never be renamed afterwards.
 */
const AmendTargetDialog: React.FC<{
  currentAttributes: Record<string, unknown>;
  originalAttributes: Record<string, unknown> | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (sourceAttributes: Record<string, unknown>, reason: string | null) => void;
}> = ({ currentAttributes, originalAttributes, isPending, onCancel, onConfirm }) => {
  const [rows, setRows] = useState<AmendRow[]>(() => buildAmendRows(currentAttributes, originalAttributes));
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [addFieldError, setAddFieldError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const updateValue = (key: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));
  };

  const removeNewRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const handleAddField = () => {
    const name = newFieldName.trim();
    if (!name) {
      setAddFieldError('Field name is required.');
      return;
    }
    if (rows.some((r) => r.key.toLowerCase() === name.toLowerCase())) {
      setAddFieldError(`"${name}" already exists — edit its value above instead of adding it again.`);
      return;
    }
    setRows((prev) => [...prev, { key: name, original: undefined, value: newFieldValue, isNew: true }]);
    setNewFieldName('');
    setNewFieldValue('');
    setAddFieldError(null);
  };

  const handleConfirm = () => {
    const sourceAttributes = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    onConfirm(sourceAttributes, reason.trim() || null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onCancel()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Amend target data</DialogTitle>
          <DialogDescription className="text-xs">
            Edits apply to future calls only. The originally imported value for each field is shown alongside it
            and stays preserved separately — past attempts remain explainable from their own recorded inputs,
            unaffected by this change. Field names can never be changed here, only their values — this prevents
            accidentally creating a duplicate field the agent would never read.
          </DialogDescription>
        </DialogHeader>

        <div className="border border-border rounded divide-y divide-border">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Field</span>
            <span>Original</span>
            <span>Effective value</span>
            <span />
          </div>
          {rows.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No fields yet — add one below.</p>}
          {rows.map((row, idx) => {
            const changed = row.original !== undefined && row.value !== row.original;
            // Row ids are index-based, never derived from the raw field
            // name — a key like "First Name" (spaces are common in
            // imported attribute names) would otherwise produce an
            // invalid HTML id and silently break the label/input pairing.
            const inputId = `amend-field-${idx}`;
            return (
              <div key={row.key} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-2 py-1.5 items-center">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate" title={row.key}>
                    {row.key}
                  </span>
                  {row.isNew && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground flex-shrink-0">
                      new
                    </Badge>
                  )}
                  {changed && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-700 text-amber-700 dark:text-amber-400 flex-shrink-0">
                      changed
                    </Badge>
                  )}
                </div>
                <Input
                  readOnly
                  tabIndex={0}
                  aria-label={`${row.key} original value`}
                  value={row.original ?? '—'}
                  title={row.original ?? '—'}
                  className="h-8 text-xs text-muted-foreground bg-muted/40 truncate"
                />
                <label htmlFor={inputId} className="sr-only">
                  {row.key} effective value
                </label>
                <Input
                  id={inputId}
                  value={row.value}
                  onChange={(e) => updateValue(row.key, e.target.value)}
                  className="h-8 text-xs"
                />
                {row.isNew ? (
                  <button
                    type="button"
                    aria-label={`Remove ${row.key}`}
                    onClick={() => removeNewRow(row.key)}
                    className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Add a field</p>
          <div className="flex items-center gap-1.5">
            <label htmlFor="amend-new-field-name" className="sr-only">
              New field name
            </label>
            <Input
              id="amend-new-field-name"
              placeholder="Field name"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <label htmlFor="amend-new-field-value" className="sr-only">
              New field value
            </label>
            <Input
              id="amend-new-field-value"
              placeholder="Value"
              value={newFieldValue}
              onChange={(e) => setNewFieldValue(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Button type="button" size="sm" variant="outline" className="h-8 px-2" aria-label="Add field" onClick={handleAddField}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {addFieldError && (
            <p role="alert" className="text-xs text-destructive">
              {addFieldError}
            </p>
          )}
        </div>

        <label htmlFor="amend-reason-textarea" className="text-xs font-medium text-foreground">
          Reason (optional)
        </label>
        <Textarea id="amend-reason-textarea" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[50px] text-sm" />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button disabled={isPending} onClick={handleConfirm}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
