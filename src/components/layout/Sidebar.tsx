import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth, hasPermission } from '@/contexts/AuthContext';
import { UserProfile } from './UserProfile';
import { IndustryIndicator } from './IndustryIndicator';
import { Logo } from '@/components/ui/logo';
import {
  BarChart3,
  Phone,
  PhoneCall,
  Users,
  Settings,
  FileText,
  MessageSquare,
  Bot,
  Star,
  Eye,
  ClipboardCheck,
  MessageCircle,
  PenTool,
  Workflow,
} from 'lucide-react';

const sidebarItems = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3, permission: 'view_all_dashboards' },
  { name: 'Call Logs', href: '/call-logs', icon: PhoneCall, permission: 'view_call_logs' },
  { name: 'Customers', href: '/customers', icon: Users, permission: 'view_call_logs' },
  { name: 'Live View', href: '/live-view', icon: Eye, permission: 'monitor_real_time' },
  { name: 'NPS Campaigns', href: '/nps-campaigns', icon: Star, permission: 'manage_nps_campaigns' },
  { name: 'Outbound Campaigns', href: '/outbound-campaigns', icon: MessageSquare, permission: 'manage_outbound_campaigns' },
  { name: 'Initiate Call', href: '/initiate-call', icon: Phone, permission: 'test_bound_calls' },
  { name: 'WhatsApp Hub', href: '/whatsapp-hub', icon: MessageCircle, permission: 'manage_whatsapp_messages' },
  { name: 'Formatting Hub', href: '/formatting-hub', icon: PenTool, permission: 'view_all_dashboards' },
  { name: 'QA Review', href: '/qa-review', icon: ClipboardCheck, permission: 'review_transcripts' },
  { name: 'AI Agents', href: '/ai-agents', icon: Bot, permission: 'view_all_dashboards' },
  { name: 'AI Orchestrator', href: '/orchestrator', icon: Workflow, permission: 'orchestrator_view' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'view_analytics' },
  { name: 'Reports', href: '/reports', icon: FileText, permission: 'view_reports' },
  { name: 'User Mgmt', href: '/user-management', icon: Users, permission: 'manage_users' },
  { name: 'Settings', href: '/settings', icon: Settings, permission: 'manage_settings' },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();

  const visibleItems = sidebarItems.filter(item => 
    item.name !== 'AI Agents' && (!item.permission || hasPermission(user, item.permission))
  );

  return (
    <div className="flex h-screen w-64 flex-col bg-gray-800 text-white">
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="flex items-center space-x-2 mb-3">
          <Logo size="xl" className="h-16" />
          <div>
            <h1 className="text-lg font-semibold">TARDIS</h1>
            <p className="text-xs text-gray-300">VoiceForce®</p>
          </div>
        </div>
        <div className="flex justify-center">
          <IndustryIndicator />
        </div>
      </div>
      
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              )}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <UserProfile />
    </div>
  );
};
