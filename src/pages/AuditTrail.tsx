import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminAuditEvents } from '@/hooks/admin/useAdmin';
import { formatTimestamp } from '@/lib/format';

const RESULT_BADGE: Record<string, { variant: 'positive' | 'escalated' | 'warning'; label: string }> = {
  success: { variant: 'positive', label: 'Success' },
  denied: { variant: 'warning', label: 'Denied' },
  error: { variant: 'escalated', label: 'Error' },
};

/**
 * Session 14.1 — the security/operational Audit Trail. Reads /api/audit
 * (gated by audit.view). This is the cross-cutting call_center.audit_events
 * log — separate from, and does not replace, Campaign History
 * (campaign_audit_events), which keeps its own domain-specific UI.
 */
const AuditTrail: React.FC = () => {
  const [resourceType, setResourceType] = useState<string>('all');
  const [result, setResult] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState('');

  const { data: events, isLoading, isError } = useAdminAuditEvents({
    limit: 200,
    resourceType: resourceType === 'all' ? undefined : resourceType,
    result: result === 'all' ? undefined : result,
  });

  const filtered = (events ?? []).filter((e) => !actionFilter || e.action.toLowerCase().includes(actionFilter.toLowerCase()));

  return (
    <Layout>
      {/* App-wide viewport-framing correction (follow-up to Session 15) —
          Pattern A, same recipe as CallLogs.tsx. */}
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="flex-shrink-0">
          <h1 className="text-base font-semibold text-foreground">Audit Trail</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Security and operationally significant actions — who did what, when, and whether it succeeded.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <Input
            placeholder="Filter by action…"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 w-56 text-xs border-border bg-card text-foreground placeholder:text-muted-foreground"
          />
          <Select value={resourceType} onValueChange={setResourceType}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All resource types</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="role">Role</SelectItem>
              <SelectItem value="campaign">Campaign</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="action_item">Action Item</SelectItem>
            </SelectContent>
          </Select>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isError && <p className="text-sm text-destructive flex-shrink-0">Could not load the audit trail.</p>}

        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Resource</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No audit events match these filters.</td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const badge = RESULT_BADGE[e.result] ?? { variant: 'warning' as const, label: e.result };
                  return (
                    <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-card">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatTimestamp(e.occurred_at)}</td>
                      <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">
                        {e.actor_type === 'user' ? (e.actor_label ?? e.actor_user_id ?? 'User') : e.actor_type === 'cron' ? 'Scheduled job' : 'System'}
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">{e.action}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {e.resource_type ? `${e.resource_type}${e.resource_id ? ` · ${e.resource_id.slice(0, 8)}` : ''}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={badge.variant} className="text-xs whitespace-nowrap">{badge.label}</Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default AuditTrail;
