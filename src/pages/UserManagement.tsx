
import React, { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { sampleUsers } from '@/data/sampleUsers';
import { getRoleDisplayName } from '@/lib/auth';
import { Users, Search, Plus, Shield, Edit, Trash2 } from 'lucide-react';

const UserManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  const filteredUsers = sampleUsers.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'all' || user.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'call_center_head':
        return 'bg-purple-100 text-purple-800';
      case 'qa_reviewer':
        return 'bg-blue-100 text-blue-800';
      case 'product_manager':
        return 'bg-green-100 text-green-800';
      case 'ai_operations_specialist':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const rolePermissions = {
    call_center_head: ['Full Dashboard Access', 'User Management', 'System Settings', 'All Analytics'],
    qa_reviewer: ['Call Review', 'Transcript Access', 'Quality Scoring', 'Feedback Management'],
    product_manager: ['Analytics Access', 'Performance Metrics', 'AI Training Insights', 'Intent Analysis'],
    ai_operations_specialist: ['AI Agent Management', 'Real-time Monitoring', 'Configuration', 'Technical Support']
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
            <p className="text-slate-600">Manage user roles and access permissions</p>
          </div>
          <Button className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600">
            <Plus className="h-4 w-4" />
            <span>Add User</span>
          </Button>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="all">All Roles</option>
                <option value="call_center_head">Call Center Head</option>
                <option value="qa_reviewer">QA Reviewer</option>
                <option value="product_manager">Product Manager</option>
                <option value="ai_operations_specialist">AI Operations Specialist</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Users Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white font-medium">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-lg">{user.name}</CardTitle>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <Badge className={getRoleBadgeColor(user.role)}>
                    {getRoleDisplayName(user.role)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Permissions</h4>
                  <div className="flex flex-wrap gap-1">
                    {rolePermissions[user.role as keyof typeof rolePermissions]?.map((permission, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-slate-500">Last Login</div>
                    <div className="font-medium text-slate-900">2 hours ago</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Status</div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-green-700">Active</span>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1 flex items-center space-x-1">
                    <Edit className="h-3 w-3" />
                    <span>Edit</span>
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 flex items-center space-x-1">
                    <Shield className="h-3 w-3" />
                    <span>Permissions</span>
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 border-red-600 hover:bg-red-50">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Role Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Role Distribution & Access Matrix</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-900">1</div>
                <div className="text-sm text-purple-700">Call Center Head</div>
                <div className="text-xs text-purple-600 mt-1">Full Access</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-900">1</div>
                <div className="text-sm text-blue-700">QA Reviewer</div>
                <div className="text-xs text-blue-600 mt-1">Quality Control</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-900">1</div>
                <div className="text-sm text-green-700">Product Manager</div>
                <div className="text-xs text-green-600 mt-1">Analytics Focus</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-900">1</div>
                <div className="text-sm text-orange-700">AI Operations</div>
                <div className="text-xs text-orange-600 mt-1">Technical Management</div>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 font-medium text-slate-700">Permission</th>
                    <th className="text-center py-2 font-medium text-slate-700">Call Center Head</th>
                    <th className="text-center py-2 font-medium text-slate-700">QA Reviewer</th>
                    <th className="text-center py-2 font-medium text-slate-700">Product Manager</th>
                    <th className="text-center py-2 font-medium text-slate-700">AI Operations</th>
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
                    <tr key={permission} className="border-b border-slate-100">
                      <td className="py-2 text-slate-700">{permission}</td>
                      <td className="text-center py-2">
                        <div className="w-4 h-4 bg-green-500 rounded-full mx-auto"></div>
                      </td>
                      <td className="text-center py-2">
                        <div className={`w-4 h-4 rounded-full mx-auto ${
                          ['View Call Logs', 'Review Transcripts'].includes(permission) 
                            ? 'bg-green-500' 
                            : 'bg-gray-300'
                        }`}></div>
                      </td>
                      <td className="text-center py-2">
                        <div className={`w-4 h-4 rounded-full mx-auto ${
                          ['View Dashboard', 'Analytics Access'].includes(permission) 
                            ? 'bg-green-500' 
                            : 'bg-gray-300'
                        }`}></div>
                      </td>
                      <td className="text-center py-2">
                        <div className={`w-4 h-4 rounded-full mx-auto ${
                          ['View Dashboard', 'Manage AI Agents'].includes(permission) 
                            ? 'bg-green-500' 
                            : 'bg-gray-300'
                        }`}></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default UserManagement;
