
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import InitiateCall from "./pages/InitiateCall";
import CallLogs from "./pages/CallLogs";
import OutboundCampaigns from "./pages/OutboundCampaigns";
import CreateCampaign from "./pages/CreateCampaign";
import NPSCampaigns from "./pages/NPSCampaigns";
import LiveView from "./pages/LiveView";
import QAReview from "./pages/QAReview";
import WhatsAppHub from "./pages/WhatsAppHub";
import FormattingHub from "./pages/FormattingHub";
import AIAgents from "./pages/AIAgents";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import UserManagement from "./pages/UserManagement";
import Settings from "./pages/Settings";
import WhatsAppAuthenticate from "./pages/WhatsAppAuthenticate";
import Orchestrator from "./pages/Orchestrator";
import OrchestratorNew from "./pages/OrchestratorNew";
import OrchestratorFlow from "./pages/OrchestratorFlow";
import OrchestratorIntegrations from "./pages/OrchestratorIntegrations";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/whatsapp-authenticate" element={<WhatsAppAuthenticate />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/initiate-call" element={<ProtectedRoute><InitiateCall /></ProtectedRoute>} />
          <Route path="/call-logs" element={<ProtectedRoute><CallLogs /></ProtectedRoute>} />
          <Route path="/outbound-campaigns" element={<ProtectedRoute><OutboundCampaigns /></ProtectedRoute>} />
          <Route path="/outbound-campaigns/create" element={<ProtectedRoute><CreateCampaign /></ProtectedRoute>} />
          <Route path="/nps-campaigns" element={<ProtectedRoute><NPSCampaigns /></ProtectedRoute>} />
          <Route path="/live-view" element={<ProtectedRoute><LiveView /></ProtectedRoute>} />
          <Route path="/qa-review" element={<ProtectedRoute><QAReview /></ProtectedRoute>} />
          <Route path="/whatsapp-hub" element={<ProtectedRoute><WhatsAppHub /></ProtectedRoute>} />
          <Route path="/formatting-hub" element={<ProtectedRoute><FormattingHub /></ProtectedRoute>} />
          <Route path="/ai-agents" element={<ProtectedRoute><AIAgents /></ProtectedRoute>} />
          <Route path="/orchestrator" element={<ProtectedRoute><Orchestrator /></ProtectedRoute>} />
          <Route path="/orchestrator/new" element={<ProtectedRoute><OrchestratorNew /></ProtectedRoute>} />
          <Route path="/orchestrator/flow/:flowId" element={<ProtectedRoute><OrchestratorFlow /></ProtectedRoute>} />
          <Route path="/orchestrator/integrations" element={<ProtectedRoute><OrchestratorIntegrations /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/user-management" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
