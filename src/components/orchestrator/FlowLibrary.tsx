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
  const [statusFilter, setStatusFilter] = useState<FlowStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<FlowChannel | 'all'>('all');

  const canEdit = hasPermission(user, 'orchestrator_edit');

  const handleCreateFlow = () => {
    navigate('/orchestrator/new');
  };

  const getStatusBadgeClass = (status: FlowStatus) => {
    switch (status) {
      case 'draft':
        return 'badge-blue';
      case 'approved':
        return 'badge-purple';
      case 'live':
        return 'badge-green';
      case 'archived':
        return 'bg-muted text-muted-foreground';
      default:
        return 'badge-blue';
    }
  };

  const getChannelBadgeClass = (channel: FlowChannel) => {
    switch (channel) {
      case 'voice':
        return 'badge-blue';
      case 'text':
        return 'badge-green';
      case 'whatsapp':
        return 'badge-purple';
      default:
        return 'badge-blue';
    }
  };

  // Flows are now imported from shared data file

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Workflow className="h-8 w-8 text-primary" />
            AI Conversation Orchestrator
          </h1>
          <p className="text-muted-foreground mt-1">
            View Conversation Flow
          </p>
        </div>
        {canEdit && false && (
          <Button onClick={handleCreateFlow} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Create Flow
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search flows by name, tags, or nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="hidden">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={channelFilter} onValueChange={(value) => setChannelFilter(value as any)}>
              <SelectTrigger className="w-40">
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
        </CardContent>
      </Card>

      {/* Flow Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sampleFlows.map((flow) => (
          <Card 
            key={flow.id} 
            className="cursor-pointer hover:shadow-soft-lg transition-shadow"
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
