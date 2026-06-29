import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import RequireAuth from "@/components/auth/RequireAuth";
import AppLayout from "@/components/layout/AppLayout";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import AcceptInvite from "@/pages/AcceptInvite";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Team from "@/pages/Team";
import OrgSettings from "@/pages/OrgSettings";
import ComingSoon from "@/pages/ComingSoon";
import Customers from "@/pages/Customers";
import Prospects from "@/pages/Prospects";
import Products from "@/pages/Products";
import Orders from "@/pages/Orders";
import Invoices from "@/pages/Invoices";
import Subscriptions from "@/pages/Subscriptions";
import Integrations from "@/pages/Integrations";
import Commissions from "@/pages/Commissions";
import Plan from "@/pages/Plan";
import Pareto from "@/pages/Pareto";
import ProductComparison from "@/pages/ProductComparison";
import Calls from "@/pages/Calls";
import CallHistory from "@/pages/CallHistory";
import CalendarPage from "@/pages/Calendar";
import LeadScoring from "@/pages/LeadScoring";
import LeadAssignment from "@/pages/LeadAssignment";
import CustomerTags from "@/pages/CustomerTags";
import Issues from "@/pages/Issues";
import RmaPage from "@/pages/Rma";
import Vouchers from "@/pages/Vouchers";
import WalletCampaigns from "@/pages/WalletCampaigns";
import Achievements from "@/pages/Achievements";
import DistributionPartners from "@/pages/DistributionPartners";
import DistributionCalculator from "@/pages/DistributionCalculator";
import DistributionAnalytics from "@/pages/DistributionAnalytics";
import AiSettings from "@/pages/AiSettings";
import AiAgents from "@/pages/AiAgents";
import AiKnowledge from "@/pages/AiKnowledge";
import Profile from "@/pages/Profile";
import Pricing from "@/pages/Pricing";
import Segments from "@/pages/Segments";
import Objectives from "@/pages/Objectives";
import Channels from "@/pages/Channels";
import Leads from "@/pages/Leads";
import Templates from "@/pages/Templates";
import Campaigns from "@/pages/Campaigns";
import OutreachDomains from "@/pages/OutreachDomains";
import OutreachWhatsApp from "@/pages/OutreachWhatsApp";
import RequireFeature from "@/components/auth/RequireFeature";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/onboarding"
                element={
                  <RequireAuth requireOrg={false}>
                    <Onboarding />
                  </RequireAuth>
                }
              />
              <Route
                path="/accept-invite"
                element={
                  <RequireAuth requireOrg={false}>
                    <AcceptInvite />
                  </RequireAuth>
                }
              />
              <Route
                path="/app"
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="/app/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="objectives" element={<Objectives />} />
                <Route path="customers" element={<Customers />} />
                <Route path="prospects" element={<Prospects />} />
                <Route path="leads" element={<RequireFeature feature="module_outreach"><Leads /></RequireFeature>} />
                <Route path="templates" element={<RequireFeature feature="module_outreach"><Templates /></RequireFeature>} />
                <Route path="campaigns" element={<RequireFeature feature="module_outreach"><Campaigns /></RequireFeature>} />
                <Route path="outreach-domains" element={<RequireFeature feature="module_outreach"><OutreachDomains /></RequireFeature>} />
                <Route path="whatsapp" element={<RequireFeature feature="module_outreach"><OutreachWhatsApp /></RequireFeature>} />
                <Route path="products" element={<Products />} />
                <Route path="channels" element={<Channels />} />
                <Route path="orders" element={<Orders />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="commissions" element={<RequireFeature feature="module_commissions"><Commissions /></RequireFeature>} />
                <Route path="team" element={<Team />} />
                <Route path="pareto" element={<Pareto />} />
                <Route path="product-comparison" element={<ProductComparison />} />
                <Route path="calls" element={<Calls />} />
                <Route path="call-history" element={<CallHistory />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="lead-scoring" element={<LeadScoring />} />
                <Route path="lead-assignment" element={<LeadAssignment />} />
                <Route path="customer-tags" element={<CustomerTags />} />
                <Route path="issues" element={<Issues />} />
                <Route path="rma" element={<RmaPage />} />
                <Route path="vouchers" element={<Vouchers />} />
                <Route path="wallet-campaigns" element={<WalletCampaigns />} />
                <Route path="achievements" element={<Achievements />} />
                <Route path="distribution/partners" element={<DistributionPartners />} />
                <Route path="distribution/calculator" element={<DistributionCalculator />} />
                <Route path="distribution/analytics" element={<DistributionAnalytics />} />
                <Route path="integrations" element={<RequireFeature feature="module_integrations"><Integrations /></RequireFeature>} />
                <Route path="plan" element={<Plan />} />
                <Route path="settings" element={<OrgSettings />} />
                <Route path="ai-settings" element={<AiSettings />} />
                <Route path="agents" element={<AiAgents />} />
                <Route path="ai-knowledge" element={<AiKnowledge />} />
                <Route path="profile" element={<Profile />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="segments" element={<Segments />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;