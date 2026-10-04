
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import InitiateCall from "./pages/InitiateCall";
import CallLogs from "./pages/CallLogs";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import ChatConsole from "./pages/ChatConsole";
import ChatLogs from "./pages/ChatLogs";
import OutboundCampaigns from "./pages/OutboundCampaigns";
import CampaignDetailPage from "./pages/CampaignDetailPage";
import CreateCampaign from "./pages/CreateCampaign";
import NPSCampaigns from "./pages/NPSCampaigns";
import LiveView from "./pages/LiveView";
import QAReview from "./pages/QAReview";
import WhatsAppHub from "./pages/WhatsAppHub";
import FormattingHub from "./pages/FormattingHub";
import AIAgents from "./pages/AIAgents";
import AgentDetail from "./pages/AgentDetail";
import Analytics from "./pages/Analytics";
import Ratios from "./pages/Ratios";
import RatioExplorer from "./pages/RatioExplorer";
import Reports from "./pages/Reports";
import UserManagement from "./pages/UserManagement";
import RoleManagement from "./pages/RoleManagement";
import AuditTrail from "./pages/AuditTrail";
import Settings from "./pages/Settings";
import WhatsAppAuthenticate from "./pages/WhatsAppAuthenticate";
import Orchestrator from "./pages/Orchestrator";
import OrchestratorNew from "./pages/OrchestratorNew";
import OrchestratorFlow from "./pages/OrchestratorFlow";
import OrchestratorIntegrations from "./pages/OrchestratorIntegrations";
import NotFound from "./pages/NotFound";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/whatsapp-authenticate" element={<WhatsAppAuthenticate />} />
          <Route path="/dashboard" element={<ProtectedRoute permission="dashboard.view"><Dashboard /></ProtectedRoute>} />
          <Route path="/initiate-call" element={<ProtectedRoute permission="calls.initiate"><InitiateCall /></ProtectedRoute>} />
          <Route path="/call-logs" element={<ProtectedRoute permission="calls.view"><CallLogs /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute permission="customers.view"><Customers /></ProtectedRoute>} />
          <Route path="/customers/:customerId" element={<ProtectedRoute permission="customers.view"><CustomerDetail /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute permission="chat.view"><ChatConsole /></ProtectedRoute>} />
          <Route path="/chat-logs" element={<ProtectedRoute permission="chat.view"><ChatLogs /></ProtectedRoute>} />
          <Route path="/outbound-campaigns" element={<ProtectedRoute permission="campaigns.view"><OutboundCampaigns /></ProtectedRoute>} />
          <Route path="/outbound-campaigns/create" element={<ProtectedRoute permission="campaigns.create"><CreateCampaign /></ProtectedRoute>} />
          <Route path="/outbound-campaigns/:campaignId" element={<ProtectedRoute permission="campaigns.view"><CampaignDetailPage /></ProtectedRoute>} />
          <Route path="/nps-campaigns" element={<ProtectedRoute><NPSCampaigns /></ProtectedRoute>} />
          <Route path="/live-view" element={<ProtectedRoute permission="live.view"><LiveView /></ProtectedRoute>} />
          <Route path="/qa-review" element={<ProtectedRoute><QAReview /></ProtectedRoute>} />
          <Route path="/whatsapp-hub" element={<ProtectedRoute><WhatsAppHub /></ProtectedRoute>} />
          <Route path="/formatting-hub" element={<ProtectedRoute><FormattingHub /></ProtectedRoute>} />
          <Route path="/ai-agents" element={<ProtectedRoute permission="agents.view"><AIAgents /></ProtectedRoute>} />
          <Route path="/ai-agents/:agentId" element={<ProtectedRoute permission="agents.view"><AgentDetail /></ProtectedRoute>} />
          <Route path="/orchestrator" element={<ProtectedRoute><Orchestrator /></ProtectedRoute>} />
          <Route path="/orchestrator/new" element={<ProtectedRoute><OrchestratorNew /></ProtectedRoute>} />
          <Route path="/orchestrator/flow/:flowId" element={<ProtectedRoute><OrchestratorFlow /></ProtectedRoute>} />
          <Route path="/orchestrator/integrations" element={<ProtectedRoute><OrchestratorIntegrations /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute permission="analytics.view"><Analytics /></ProtectedRoute>} />
          <Route path="/ratios" element={<ProtectedRoute permission="ratios.view"><Ratios /></ProtectedRoute>} />
          <Route path="/ratios/:ratioId" element={<ProtectedRoute permission="ratios.view"><RatioExplorer /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/user-management" element={<ProtectedRoute permission="users.view"><UserManagement /></ProtectedRoute>} />
          <Route path="/role-management" element={<ProtectedRoute permission="roles.view"><RoleManagement /></ProtectedRoute>} />
          <Route path="/audit-trail" element={<ProtectedRoute permission="audit.view"><AuditTrail /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
