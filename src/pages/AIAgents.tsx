import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useAgents } from '@/hooks/agents/useAgents';
import { useCampaigns } from '@/hooks/campaigns/useCampaigns';
import { countCampaignsByAgent } from '@/services/agents/agentPerformanceAggregator';
import { formatStatusLabel } from '@/lib/format';

/**
 * Real /api/v1/agents roster — replaces the previous entirely-mock page
 * (fake status by row index, Math.random() success rate/calls/engagement
 * time, no-op Create/Configure/Play/Pause controls; see
 * docs/CALL_CENTRE_SESSION6_AGENTS_QUALITY_PLAN.md §1/§2). The roster is
 * read-only (no documented create/update/delete API) — there is no
 * "Create Agent" action, and each row links to a real operational
 * AgentDetail view instead of a no-op configuration dialog.
 *
 * Session 11.7 (docs/SCREEN_REVIEW_06_AI_AGENTS.md): reskinned to the
 * G1/C1/S1/L1 Operational Grid Standard — Agent / Direction / Usage /
 * Action. Persona and Language moved to Agent Detail (§7/§8A of the
 * review): genuine live fields, but not decision-relevant at the
 * roster-scanning level and undocumented in the revised Partner API
 * spec. Status and Contract columns are deliberately NOT added — the
 * revised API's status/description/expected_* fields are not live
 * (§4/§13 of the review); fabricating them would misrepresent the
 * Partner API. F1 filtering is deliberately omitted — no useful filter
 * dimension exists yet at a 3-agent roster (§7 of the review).
 */
const AIAgents: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useAgents();
  const agents = data?.agents ?? [];

  // Same bounded campaigns fetch useAgentDetail already relies on (most
  // recent 100) — see agentPerformanceAggregator.countCampaignsByAgent's
  // doc comment. No new repository method / schema change.
  const campaignsQuery = useCampaigns({ pageSize: 100 });
  const campaignCounts = countCampaignsByAgent(campaignsQuery.data?.data ?? []);
  const campaignsBounded = (campaignsQuery.data?.pagination.totalCount ?? 0) > 100;

  return (
    <Layout>
      <div className="bg-background h-full min-h-0 text-foreground p-4 flex flex-col gap-3">
        <div className="text-xs text-muted-foreground px-1 flex-shrink-0">
          Live agent roster — used across Voice, Chat, Customer 360 and Campaigns.
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-red-400 px-1">Could not load the agent roster.</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No agents available.</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                {/* G1 dense operational grid (docs/VOICEFORCE_OPERATIONAL_GRID_STANDARD.md
                    §G1): ~32-36px header, not the shadcn default h-12/px-4. */}
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="h-9 px-3 text-muted-foreground text-xs">Agent</TableHead>
                  <TableHead className="h-9 px-3 text-muted-foreground text-xs">Direction</TableHead>
                  <TableHead className="h-9 px-3 text-muted-foreground text-xs">Usage</TableHead>
                  <TableHead className="h-9 px-3 text-muted-foreground text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => {
                  const campaignCount = campaignCounts.get(agent.agentId) ?? 0;
                  const openDetail = () => navigate(`/ai-agents/${agent.agentId}`, { state: { origin: 'ai-agents' } });
                  return (
                    <TableRow
                      key={agent.agentId}
                      className="cursor-pointer border-border/60 hover:bg-card focus-within:bg-card"
                      onClick={openDetail}
                    >
                      {/* C1: identity column is the flexible one — no fixed
                          max-width truncating names like "Inbound Banking
                          Assistant". Immutable agent_id shown as a compact
                          secondary line, matching every other operational
                          grid's identity-cell convention. */}
                      <TableCell className="py-1.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{agent.displayName}</span>
                          {agent.isDefault && (
                            <Badge variant="outline" className="text-xs border-slate-600 text-foreground">Default</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">{agent.agentId}</span>
                      </TableCell>
                      <TableCell className="py-1.5 px-3">
                        <Badge variant="secondary" className="text-xs">{formatStatusLabel(agent.direction)}</Badge>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-sm text-foreground whitespace-nowrap">
                        {campaignsQuery.isLoading ? (
                          <span className="text-muted-foreground">…</span>
                        ) : (
                          <span title={campaignsBounded ? 'Counted from the most recent 100 campaigns' : undefined}>
                            {campaignCount} {campaignCount === 1 ? 'campaign' : 'campaigns'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-cyan-400 hover:text-cyan-300 hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail();
                          }}
                        >
                          View →
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AIAgents;
