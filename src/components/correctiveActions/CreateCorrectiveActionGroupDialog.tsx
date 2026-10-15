import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCreateCorrectiveActionGroup } from '@/hooks/correctiveActions/useCorrectiveActions';
import type { CorrectiveActionGroup } from '@/services/correctiveActions/correctiveActionsService';

interface CreateCorrectiveActionGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (group: CorrectiveActionGroup) => void;
  /** Suggested default title (e.g. the originating CA's own title) —
   * editable, never auto-submitted. */
  defaultTitle?: string;
}

/**
 * Session 16.5 final correction — the application-dialog replacement for
 * the two window.prompt() group-creation flows (CorrectiveActions.tsx's
 * "Create Group from Selection" toolbar, and
 * CorrectiveActionDetailDialog.tsx's "Link Selected into New Group").
 * A native prompt() blocks the whole page/event loop while open, which
 * is both poor UX (no styling, no validation feedback) and was observed
 * to hang a live browser automation session during acceptance testing.
 * The existing group-creation API (`call_center_corrective_action_groups_create`)
 * is unchanged — this only replaces how the title is collected.
 */
export const CreateCorrectiveActionGroupDialog: React.FC<CreateCorrectiveActionGroupDialogProps> = ({ isOpen, onClose, onCreated, defaultTitle }) => {
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [description, setDescription] = useState('');

  const createGroupMutation = useCreateCorrectiveActionGroup();

  React.useEffect(() => {
    if (isOpen) {
      setTitle(defaultTitle ?? '');
      setDescription('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultTitle]);

  const canSave = title.trim().length > 0 && !createGroupMutation.isPending;

  const handleCreate = () => {
    if (!canSave) return;
    createGroupMutation.mutate(
      { title: title.trim(), description: description.trim() || undefined },
      {
        onSuccess: (group) => {
          onCreated(group);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">New Corrective Action Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ca-group-title" className="text-xs">Title</Label>
            <Input id="ca-group-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shared root cause summary" autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ca-group-description" className="text-xs">Description (optional)</Label>
            <Textarea id="ca-group-description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[70px] text-sm" />
          </div>
          {createGroupMutation.isError && <p role="alert" className="text-xs text-destructive">Could not create the group. Please try again.</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" disabled={createGroupMutation.isPending} onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!canSave} onClick={handleCreate}>{createGroupMutation.isPending ? 'Creating…' : 'Create'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
