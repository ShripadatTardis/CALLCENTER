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
  Percent,
  KeyRound,
  ScrollText,
  ListChecks,
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
      { name: 'Dashboard', href: '/dashboard', icon: BarChart3, permission: 'dashboard.view' },
      { name: 'Live View', href: '/live-view', icon: Eye, permission: 'live.view' },
      { name: 'Call Logs', href: '/call-logs', icon: PhoneCall, permission: 'calls.view' },
      { name: 'Chat Logs', href: '/chat-logs', icon: History, permission: 'chat.view' },
      { name: 'Customers', href: '/customers', icon: Users, permission: 'customers.view', matchPrefix: '/customers' },
    ],
  },
  {
    key: 'control',
    label: 'Control',
    blurb: 'Intervene in AI operations',
    items: [
      { name: 'Initiate Call', href: '/initiate-call', icon: Phone, permission: 'calls.initiate' },
      { name: 'Action Required', href: '/action-required', icon: ListChecks, permission: 'actions.view' },
      // Session 14.1 — no dedicated "send chat" permission exists in the
      // finalized vocabulary (the real capability inventory only
      // surfaced customers.activity.* and calls.initiate as genuine
      // Control-pillar mutations); reusing chat.view is a pragmatic,
      // documented choice rather than inventing a new permission key.
      { name: 'Chat', href: '/chat', icon: MessagesSquare, permission: 'chat.view' },
    ],
  },
  {
    key: 'operationalize',
    label: 'Operationalize',
    blurb: 'Turn conversations into business work',
    items: [
      { name: 'Outbound Campaigns', href: '/outbound-campaigns', icon: MessageSquare, permission: 'campaigns.view', matchPrefix: '/outbound-campaigns' },
      // NPS Campaigns remains a placeholder (not in the Session 14.1
      // capability inventory) — intentionally left ungated rather than
      // fabricating a permission for a non-real capability.
      { name: 'NPS Campaigns', href: '/nps-campaigns', icon: Star },
    ],
  },
  {
    key: 'integrate',
    label: 'Integrate',
    blurb: 'Connect VoiceForce to external systems/channels',
    items: [
      // WhatsApp Hub / Formatting Hub / AI Orchestrator are legacy/
      // placeholder surfaces outside this session's real capability
      // inventory — left ungated (visible to any signed-in user) rather
      // than fabricating permissions for them. See docs/SESSION_14_1_*.md.
      { name: 'WhatsApp Hub', href: '/whatsapp-hub', icon: MessageCircle },
      { name: 'Formatting Hub', href: '/formatting-hub', icon: PenTool },
      { name: 'AI Orchestrator', href: '/orchestrator', icon: Workflow, matchPrefix: '/orchestrator' },
    ],
  },
  {
    key: 'improve',
    label: 'Improve',
    blurb: 'Improve agents from interaction evidence',
    items: [
      { name: 'AI Agents', href: '/ai-agents', icon: Bot, permission: 'agents.view', matchPrefix: '/ai-agents' },
      // Interaction Quality (QA Review) is outside this session's
      // inventory — left ungated, same reasoning as above.
      { name: 'Interaction Quality', href: '/qa-review', icon: ClipboardCheck },
    ],
  },
  {
    key: 'measure',
    label: 'Measure',
    blurb: 'Operational and economic performance',
    items: [
      { name: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'analytics.view' },
      { name: 'Ratios', href: '/ratios', icon: Percent, permission: 'ratios.view', matchPrefix: '/ratios' },
    ],
  },
  {
    key: 'govern',
    label: 'Govern',
    blurb: 'Identity, security, audit and resilience',
    items: [
      { name: 'User Mgmt', href: '/user-management', icon: Users, permission: 'users.view' },
      { name: 'Role Mgmt', href: '/role-management', icon: KeyRound, permission: 'roles.view' },
      { name: 'Audit Trail', href: '/audit-trail', icon: ScrollText, permission: 'audit.view' },
      // Settings remains a placeholder — left ungated, same reasoning as above.
      { name: 'Settings', href: '/settings', icon: Settings },
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
