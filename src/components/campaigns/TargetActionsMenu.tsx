import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { MoreHorizontal, Loader2 } from 'lucide-react';
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

const AmendTargetDialog: React.FC<{
  currentAttributes: Record<string, unknown>;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (sourceAttributes: Record<string, unknown>, reason: string | null) => void;
}> = ({ currentAttributes, isPending, onCancel, onConfirm }) => {
  const [json, setJson] = useState(() => JSON.stringify(currentAttributes ?? {}, null, 2));
  const [reason, setReason] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setJson(JSON.stringify(currentAttributes ?? {}, null, 2));
  }, [currentAttributes]);

  const handleConfirm = () => {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setParseError('Must be a JSON object (e.g. {"amount": 250}).');
        return;
      }
      setParseError(null);
      onConfirm(parsed, reason.trim() || null);
    } catch {
      setParseError('Invalid JSON — check the syntax.');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Amend target data</DialogTitle>
          <DialogDescription className="text-xs">
            Edits apply to future calls only. The originally imported values are preserved separately and remain
            visible — past attempts stay explainable from their own recorded inputs, unaffected by this change.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="amend-json-textarea" className="text-xs font-medium text-foreground">
          Effective data (JSON)
        </label>
        <Textarea
          id="amend-json-textarea"
          autoFocus
          value={json}
          onChange={(e) => setJson(e.target.value)}
          className="min-h-[140px] text-sm font-mono"
          aria-invalid={Boolean(parseError)}
          aria-describedby={parseError ? 'amend-json-error' : undefined}
        />
        {parseError && (
          <p id="amend-json-error" role="alert" className="text-xs text-destructive">
            {parseError}
          </p>
        )}
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
