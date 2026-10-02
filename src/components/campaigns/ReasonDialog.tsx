import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

interface ReasonDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmVariant?: 'default' | 'destructive';
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Session 12.7 §14 — a small reusable "this action needs a reason"
 * dialog, used for Pause/Stop (both now server-required, see
 * call_center_campaign_set_status_audited) and anywhere else an
 * audited free-text reason is needed. Reuses the existing Dialog/
 * Textarea/Button primitives — no new visual language.
 */
export const ReasonDialog: React.FC<ReasonDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  confirmVariant = 'default',
  isPending,
  onCancel,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  // The dialog instance persists across opens (only `isOpen` toggles) — clear
  // stale text from a previous action (e.g. a typed-then-cancelled Pause
  // reason) so it can never leak into a different action's audit entry.
  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
        </DialogHeader>
        <label htmlFor="reason-dialog-textarea" className="text-xs font-medium text-foreground">
          Reason
        </label>
        <Textarea
          id="reason-dialog-textarea"
          autoFocus
          required
          aria-required="true"
          placeholder="Explain why…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-[70px] text-sm"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            disabled={!trimmed || isPending}
            onClick={() => onConfirm(trimmed)}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {isPending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
