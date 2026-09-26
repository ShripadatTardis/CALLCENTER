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
  MessagesSquare,
  History,
  PenTool,
  Workflow,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  /** Only used for /ai-agents/:agentId style "highlight parent on sub-route" matching. */
  matchPrefix?: string;
}

export interface Pillar {
  key: string;
  label: string;
  blurb: string;
  items: NavItem[];
}

/**
 * Product information architecture (Session 7.2). This groups existing
 * routes under the seven VoiceForce product pillars — it does not change
 * any route path, and is deliberately separate from the Session 6.2
 * interaction classification hierarchy (Domain -> Category -> Agent ->
 * Channel), which answers a different question ("which interactions") and
 * lives inside Call Logs / Chat Logs / Interaction Quality / Customer 360 /
 * Analytics, not in this navigation.
 */
export const PILLARS: Pillar[] = [
  {
    key: 'observe',
    label: 'Observe',
    blurb: 'Understand what AI agents are doing',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: BarChart3, permission: 'view_all_dashboards' },
      { name: 'Live View', href: '/live-view', icon: Eye, permission: 'monitor_real_time' },
      { name: 'Call Logs', href: '/call-logs', icon: PhoneCall, permission: 'view_call_logs' },
      { name: 'Chat Logs', href: '/chat-logs', icon: History, permission: 'view_call_logs' },
      { name: 'Customers', href: '/customers', icon: Users, permission: 'view_call_logs', matchPrefix: '/customers' },
    ],
  },
  {
    key: 'control',
    label: 'Control',
    blurb: 'Intervene in AI operations',
    items: [
      { name: 'Initiate Call', href: '/initiate-call', icon: Phone, permission: 'test_bound_calls' },
      { name: 'Chat', href: '/chat', icon: MessagesSquare, permission: 'test_bound_calls' },
    ],
  },
  {
    key: 'operationalize',
    label: 'Operationalize',
    blurb: 'Turn conversations into business work',
    items: [
      { name: 'Outbound Campaigns', href: '/outbound-campaigns', icon: MessageSquare, permission: 'manage_outbound_campaigns', matchPrefix: '/outbound-campaigns' },
      { name: 'NPS Campaigns', href: '/nps-campaigns', icon: Star, permission: 'manage_nps_campaigns' },
    ],
  },
  {
    key: 'integrate',
    label: 'Integrate',
    blurb: 'Connect VoiceForce to external systems/channels',
    items: [
      { name: 'WhatsApp Hub', href: '/whatsapp-hub', icon: MessageCircle, permission: 'manage_whatsapp_messages' },
      { name: 'Formatting Hub', href: '/formatting-hub', icon: PenTool, permission: 'view_all_dashboards' },
      { name: 'AI Orchestrator', href: '/orchestrator', icon: Workflow, permission: 'orchestrator_view', matchPrefix: '/orchestrator' },
    ],
  },
  {
    key: 'improve',
    label: 'Improve',
    blurb: 'Improve agents from interaction evidence',
    items: [
      { name: 'AI Agents', href: '/ai-agents', icon: Bot, permission: 'view_all_dashboards', matchPrefix: '/ai-agents' },
      { name: 'Interaction Quality', href: '/qa-review', icon: ClipboardCheck, permission: 'review_transcripts' },
    ],
  },
  {
    key: 'measure',
    label: 'Measure',
    blurb: 'Operational and economic performance',
    items: [
      { name: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'view_analytics' },
    ],
  },
  {
    key: 'govern',
    label: 'Govern',
    blurb: 'Identity, security, audit and resilience',
    items: [
      { name: 'User Mgmt', href: '/user-management', icon: Users, permission: 'manage_users' },
      { name: 'Settings', href: '/settings', icon: Settings, permission: 'manage_settings' },
    ],
  },
];

/** Icon for the Govern pillar heading when it has real items, kept out of NavItem list itself. */
export const GOVERN_ICON = ShieldCheck;

/**
 * Legacy/superseded routes kept alive so bookmarked URLs keep working, but
 * deliberately not featured in the pillar navigation: `/reports` predates
 * Session 7's real Analytics export and is still Lovable-era mock data.
 */
export const UNLISTED_ROUTES = ['/reports'];

export function findPillarForPath(pathname: string): Pillar | undefined {
  return PILLARS.find((pillar) =>
    pillar.items.some((item) => pathname === item.href || (item.matchPrefix && pathname.startsWith(item.matchPrefix)))
  );
}

/** Same lookup, but also returns the matched nav item — used by the compact context bar. */
export function findPillarAndItemForPath(pathname: string): { pillar: Pillar; item: NavItem } | undefined {
  for (const pillar of PILLARS) {
    const item = pillar.items.find(
      (it) => pathname === it.href || (it.matchPrefix && pathname.startsWith(it.matchPrefix))
    );
    if (item) return { pillar, item };
  }
  return undefined;
}
