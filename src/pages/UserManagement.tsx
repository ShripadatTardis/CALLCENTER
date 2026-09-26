
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MetricStrip } from '@/components/common/MetricStrip';
import { sampleUsers } from '@/data/sampleUsers';
import { getRoleDisplayName } from '@/lib/auth';
import { Search, Plus, Shield, Edit, Trash2 } from 'lucide-react';

const UserManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  const filteredUsers = sampleUsers.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'all' || user.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const rolePermissions = {
    call_center_head: ['Full Dashboard Access', 'User Management', 'System Settings', 'All Analytics'],
    qa_reviewer: ['Call Review', 'Transcript Access', 'Quality Scoring', 'Feedback Management'],
    product_manager: ['Analytics Access', 'Performance Metrics', 'AI Training Insights', 'Intent Analysis'],
    ai_operations_specialist: ['AI Agent Management', 'Real-time Monitoring', 'Configuration', 'Technical Support']
  };

  return (
    <Layout>
      <div className="bg-background min-h-full text-foreground p-4 space-y-3">
        <div className="flex items-center justify-end">
          <Button size="sm" className="h-8 bg-cyan-600 hover:bg-cyan-500">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add User
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
            <Input
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-7 text-xs border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="h-8 border border-border bg-card text-foreground rounded-md px-2 text-xs"
          >
            <option value="all">All Roles</option>
            <option value="call_center_head">Call Center Head</option>
            <option value="qa_reviewer">QA Reviewer</option>
            <option value="product_manager">Product Manager</option>
            <option value="ai_operations_specialist">AI Operations Specialist</option>
          </select>
        </div>

        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Permissions</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-border/60 last:border-0 hover:bg-card">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-cyan-600/20 text-cyan-400 flex items-center justify-center text-xs font-semibold shrink-0">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{user.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs whitespace-nowrap border-slate-600 text-foreground">{getRoleDisplayName(user.role)}</Badge>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <div className="flex flex-wrap gap-1">
                      {rolePermissions[user.role as keyof typeof rolePermissions]?.slice(0, 2).map((permission, index) => (
                        <Badge key={index} variant="outline" className="text-[10px] border-slate-600 text-muted-foreground">{permission}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Edit" aria-label={`Edit ${user.name}`}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" title="Permissions" aria-label={`Manage permissions for ${user.name}`}>
                      <Shield className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" title="Remove" aria-label={`Remove ${user.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Role Distribution &amp; Access Matrix</div>
          <MetricStrip
            items={[
              { label: 'Call Center Head', value: 1, hint: 'Full access' },
              { label: 'QA Reviewer', value: 1, hint: 'Quality control' },
              { label: 'Product Manager', value: 1, hint: 'Analytics focus' },
              { label: 'AI Operations', value: 1, hint: 'Technical management' },
            ]}
          />

          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Permission</th>
                  <th className="text-center px-3 py-2 font-medium">Call Center Head</th>
                  <th className="text-center px-3 py-2 font-medium">QA Reviewer</th>
                  <th className="text-center px-3 py-2 font-medium">Product Manager</th>
                  <th className="text-center px-3 py-2 font-medium">AI Operations</th>
                </tr>
              </thead>
              <tbody>
                {[
                  'View Dashboard',
                  'Manage Users',
                  'View Call Logs',
                  'Review Transcripts',
                  'Analytics Access',
                  'Manage AI Agents',
                  'System Settings'
                ].map((permission) => (
                  <tr key={permission} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-foreground">{permission}</td>
                    <td className="text-center py-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full mx-auto" />
                    </td>
                    <td className="text-center py-2">
                      <div className={`w-2 h-2 rounded-full mx-auto ${
                        ['View Call Logs', 'Review Transcripts'].includes(permission) ? 'bg-emerald-500' : 'bg-slate-700'
                      }`} />
                    </td>
                    <td className="text-center py-2">
                      <div className={`w-2 h-2 rounded-full mx-auto ${
                        ['View Dashboard', 'Analytics Access'].includes(permission) ? 'bg-emerald-500' : 'bg-slate-700'
                      }`} />
                    </td>
                    <td className="text-center py-2">
                      <div className={`w-2 h-2 rounded-full mx-auto ${
                        ['View Dashboard', 'Manage AI Agents'].includes(permission) ? 'bg-emerald-500' : 'bg-slate-700'
                      }`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default UserManagement;
