import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useProvisionUser } from '@/hooks/admin/useAdmin';
import { isApiError } from '@/services/transport/errors';
import type { AdminRole, AdminUserDetail } from '@/services/admin/adminService';
import { getRoleDisplayName } from '@/lib/auth';

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: AdminRole[];
}

/**
 * Session 14.2 — Administrator-facing provisioning. Deliberately small:
 * email, display name, one role. No password field — the invited
 * person establishes their own via a real Supabase Auth invite email.
 */
export const AddUserDialog: React.FC<AddUserDialogProps> = ({ open, onOpenChange, roles }) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [error, setError] = useState('');
  const [existingUser, setExistingUser] = useState<AdminUserDetail | null>(null);
  const [success, setSuccess] = useState(false);
  const provision = useProvisionUser();

  const reset = () => {
    setEmail('');
    setDisplayName('');
    setRoleCode('');
    setError('');
    setExistingUser(null);
    setSuccess(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setExistingUser(null);

    if (!email.trim() || !roleCode) {
      setError('Email and role are required.');
      return;
    }

    try {
      await provision.mutateAsync({ email: email.trim(), displayName: displayName.trim(), roleCode });
      setSuccess(true);
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        const raw = err.raw as { data?: AdminUserDetail } | undefined;
        setExistingUser(raw?.data ?? null);
        setError('A Call Centre user already exists for this email.');
        return;
      }
      setError(isApiError(err) ? err.message : 'Could not provision this user.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add User</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Invitation sent to {email}. They'll establish their own password and sign in once they accept it.
              </AlertDescription>
            </Alert>
            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-user-email" className="text-xs font-medium">Email</Label>
              <Input
                id="add-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@example.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-user-name" className="text-xs font-medium">Display name</Label>
              <Input
                id="add-user-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-user-role" className="text-xs font-medium">Role</Label>
              <Select value={roleCode} onValueChange={setRoleCode}>
                <SelectTrigger id="add-user-role" className="h-9 text-sm"><SelectValue placeholder="Select a role…" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{getRoleDisplayName(r.code)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error}
                  {existingUser && (
                    <span className="block mt-1 text-xs">
                      Existing status: {existingUser.status} · Role(s): {existingUser.roles.map(getRoleDisplayName).join(', ') || 'none'}.
                      Use that user's row in the list to manage them instead.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={provision.isPending}>
                {provision.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {provision.isPending ? 'Sending…' : 'Send invitation'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
