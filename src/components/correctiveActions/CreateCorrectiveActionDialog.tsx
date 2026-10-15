import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useCreateCorrectiveAction } from '@/hooks/correctiveActions/useCorrectiveActions';
import type { CorrectiveActionCategory, CorrectiveActionPriority, CreateCorrectiveActionInput } from '@/services/correctiveActions/correctiveActionsService';

const CATEGORIES: Array<{ value: CorrectiveActionCategory; label: string }> = [
  { value: 'agent_behavior', label: 'Agent Behaviour' },
  { value: 'knowledge_base', label: 'Knowledge Base' },
  { value: 'campaign_configuration', label: 'Campaign Configuration' },
  { value: 'process', label: 'Process' },
  { value: 'technical', label: 'Technical' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES: Array<{ value: CorrectiveActionPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

interface CreateCorrectiveActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  /** Pre-filled, source-independent defaults (e.g. a QA adapter already
   * built a `CreateCorrectiveActionInput`) — same generic input shape a
   * fully manual creation uses, per brief §6/§12. */
  initialValues?: Partial<CreateCorrectiveActionInput>;
}

/**
 * Session 16.5 — the source-independent manual creation flow (brief
 * §12). Works identically whether `initialValues` is empty (pure manual
 * creation, no QA reference at all) or pre-populated by a QA adapter —
 * this component has no QA-specific knowledge itself.
 */
export const CreateCorrectiveActionDialog: React.FC<CreateCorrectiveActionDialogProps> = ({ isOpen, onClose, onCreated, initialValues }) => {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [category, setCategory] = useState<CorrectiveActionCategory>(initialValues?.category ?? 'other');
  const [priority, setPriority] = useState<CorrectiveActionPriority>(initialValues?.priority ?? 'medium');
  const [dueAt, setDueAt] = useState('');

  const createMutation = useCreateCorrectiveAction();

  React.useEffect(() => {
    if (isOpen) {
      setTitle(initialValues?.title ?? '');
      setDescription(initialValues?.description ?? '');
      setCategory(initialValues?.category ?? 'other');
      setPriority(initialValues?.priority ?? 'medium');
      setDueAt('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const canSave = title.trim().length > 0 && description.trim().length > 0 && !createMutation.isPending;

  const handleCreate = () => {
    createMutation.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        dueAt: dueAt || undefined,
        agentId: initialValues?.agentId ?? undefined,
        sourceType: initialValues?.sourceType ?? 'manual',
        sourceReferenceId: initialValues?.sourceReferenceId ?? undefined,
        sourceContext: initialValues?.sourceContext ?? undefined,
        idempotencyKey: initialValues?.idempotencyKey,
      },
      {
        onSuccess: (ca) => {
          toast.success(`Created ${ca.caNumber ? `CA-${String(ca.caNumber).padStart(6, '0')}` : 'corrective action'}.`);
          onCreated?.(ca.id);
          onClose();
        },
        onError: () => toast.error('Could not create the corrective action.'),
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {initialValues?.sourceType && initialValues.sourceType !== 'manual' ? 'Create Corrective Action from Finding' : 'New Corrective Action'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ca-title" className="text-xs">Title</Label>
            <Input id="ca-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short, specific summary of the issue" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-description" className="text-xs">Description</Label>
            <Textarea id="ca-description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[90px] text-sm" placeholder="What happened, and why it needs correction" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CorrectiveActionCategory)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as CorrectiveActionPriority)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-due" className="text-xs">Due date (optional)</Label>
            <Input id="ca-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          {initialValues?.sourceReferenceId && (
            <p className="text-xs text-muted-foreground">Linked to source reference {initialValues.sourceReferenceId} — the underlying finding is preserved by reference, not copied.</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!canSave} onClick={handleCreate}>{createMutation.isPending ? 'Creating…' : 'Create'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
