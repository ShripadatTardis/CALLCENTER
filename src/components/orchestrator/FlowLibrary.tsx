import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Workflow, Filter } from 'lucide-react';
import { FlowStatus, FlowChannel } from '@/types/orchestrator';
import { sampleFlows } from '@/data/orchestratorFlows';

export const FlowLibrary: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<FlowChannel | 'all'>('all');

  const canEdit = hasPermission(user, 'orchestrator_edit');

  const handleCreateFlow = () => {
    navigate('/orchestrator/new');
  };

  // Session 7.10.1 — migrated from `badge-blue`/`-purple`/`-green`, which
  // are undefined anywhere in tailwind.config.ts/index.css (confirmed by
  // grep) and rendered NO styling at all — a real functional bug,
  // same class as Session 7.10's `shadow-soft-md`/`-lg` fix. Real-meaning
  // mapping: draft="not yet started" -> neutral; approved="ready, not
  // yet live" -> pending; live="active" -> positive; archived unchanged
  // (already the centralized bg-muted/text-muted-foreground tokens).
  const getStatusBadgeClass = (status: FlowStatus) => {
    switch (status) {
      case 'draft':
        return 'border-[var(--status-neutral-border)] text-[var(--status-neutral-text)]';
      case 'approved':
        return 'border-[var(--status-pending-border)] text-[var(--status-pending-text)]';
      case 'live':
        return 'border-[var(--status-positive-border)] text-[var(--status-positive-text)]';
      case 'archived':
        return 'bg-muted text-muted-foreground';
      default:
        return 'border-[var(--status-neutral-border)] text-[var(--status-neutral-text)]';
    }
  };

  // Session 7.10.1 correction — a CHANNEL category tag, not a business
  // status; `badge-blue`/`-green`/`-purple` were undefined anywhere in
  // this codebase and rendered no styling at all. Deliberately NOT
  // mapped onto the status roles (positive/caution/negative/pending/
  // neutral) — voice/text/whatsapp carry no status meaning. Reuses the
  // existing, already dual-customer-populated chart series palette
  // (the same kind of arbitrary, non-status categorical color these
  // tags need) rather than inventing a new schema section. Preserves
  // the 3 real distinctions, 1:1 with the prior (broken) color intent.
  const getChannelBadgeClass = (channel: FlowChannel) => {
    switch (channel) {
      case 'voice':
        return 'border-[var(--chart-series-1)] text-[var(--chart-series-1)]';
      case 'text':
        return 'border-[var(--chart-series-3)] text-[var(--chart-series-3)]';
      case 'whatsapp':
        return 'border-[var(--chart-series-2)] text-[var(--chart-series-2)]';
      default:
        return 'border-[var(--chart-series-1)] text-[var(--chart-series-1)]';
    }
  };

  // Flows are now imported from shared data file

  return (
    // App-wide viewport-framing correction (follow-up to Session 15) — Pattern B.
    <div className="h-full min-h-0 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Workflow className="h-4 w-4 text-primary shrink-0" />
          <h1 className="text-sm font-semibold text-foreground truncate">
            AI Conversation Orchestrator
          </h1>
        </div>
        {canEdit && false && (
          <Button onClick={handleCreateFlow} size="sm" className="gap-1.5 shrink-0">
            <Plus className="h-3.5 w-3.5" />
            Create Flow
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search flows by name, tags, or nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <Select value={channelFilter} onValueChange={(value) => setChannelFilter(value as any)}>
          <SelectTrigger className="h-9 w-full sm:w-40 shrink-0">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="voice">Voice</SelectItem>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Flow Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sampleFlows.map((flow) => (
          <Card 
            key={flow.id} 
            className="cursor-pointer hover:shadow-[var(--shadow-prominent)] transition-shadow"
            onClick={() => navigate(`/orchestrator/flow/${flow.id}`)}
          >
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <CardTitle className="text-lg">{flow.name}</CardTitle>
                <Badge className={getStatusBadgeClass(flow.status)}>
                  {flow.status}
                </Badge>
              </div>
              <CardDescription>{flow.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {flow.channels.map((channel) => (
                    <Badge key={channel} variant="outline" className={getChannelBadgeClass(channel)}>
                      {channel}
                    </Badge>
                  ))}
                  <Badge variant="outline" className="badge-orange">
                    {flow.industry}
                  </Badge>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Version {flow.version} • Updated {new Date(flow.updatedAt).toLocaleDateString()} by {flow.updatedBy.name}
                </div>

                {flow.metrics && flow.status === 'live' && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                    <div>
                      <div className="text-xs text-muted-foreground">Completions</div>
                      <div className="text-lg font-semibold text-foreground">
                        {flow.metrics.completions.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Drop-off</div>
                      <div className="text-lg font-semibold text-foreground">
                        {flow.metrics.dropOffRate}%
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {sampleFlows.length === 0 && (
        <Card className="p-12 text-center">
          <Workflow className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No flows yet</h3>
          <p className="text-muted-foreground mb-6">
            Create your first conversational workflow to get started
          </p>
          {canEdit && (
            <Button onClick={handleCreateFlow} size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Create Flow
            </Button>
          )}
        </Card>
      )}
    </div>
  );
};
