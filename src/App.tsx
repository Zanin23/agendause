import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CommandPalette } from "@/components/CommandPalette";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import HomeExperimental from "./pages/HomeExperimental";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import TrainingDetail from "./pages/TrainingDetail";
import PrintAgenda from "./pages/PrintAgenda";
import TrainingTerm from "./pages/TrainingTerm";
import GuestAccept from "./pages/GuestAccept";
import NotFound from "./pages/NotFound";
import Schedules from "./pages/Schedules";
import ScheduleNew from "./pages/ScheduleNew";
import ScheduleEditor from "./pages/ScheduleEditor";
import SchedulePrint from "./pages/SchedulePrint";
import SchedulePublic from "./pages/SchedulePublic";
import SurveyPublic from "./pages/SurveyPublic";
import SurveyReport from "./pages/SurveyReport";
import HandoffTerm from "./pages/HandoffTerm";
import ScheduleVisual from "./pages/ScheduleVisual";
import HandoffPublic from "./pages/HandoffPublic";
import BillingRequests from "./pages/BillingRequests";
import Notes from "./pages/Notes";
import SelectWorkspace from "./pages/SelectWorkspace";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import Index from "./pages/Index";
import Article from "./pages/Article";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never refetch just because the tab regained focus — it wiped in-progress edits.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30_000,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
          <CommandPalette />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/aceite/:id" element={<GuestAccept />} />
            <Route path="/c/:token" element={<SchedulePublic />} />
            <Route path="/q/:token" element={<SurveyPublic />} />
             <Route path="/levantamentos/:id/relatorio" element={<ProtectedRoute><SurveyReport /></ProtectedRoute>} />
            <Route path="/t/:token" element={<HandoffPublic />} />
            <Route path="/selecionar-base" element={<ProtectedRoute requireWorkspace={false}><SelectWorkspace /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><HomeExperimental /></ProtectedRoute>} />
            <Route path="/inicio-classico" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/inicio-experimental" element={<ProtectedRoute><HomeExperimental /></ProtectedRoute>} />
            <Route path="/blog" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/blog/:slug" element={<ProtectedRoute><Article /></ProtectedRoute>} />
            <Route path="/agenda" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/treinamento/:id" element={<ProtectedRoute><TrainingDetail /></ProtectedRoute>} />
            <Route path="/treinamento/:id/termo" element={<ProtectedRoute><TrainingTerm /></ProtectedRoute>} />
            <Route path="/agenda/imprimir" element={<ProtectedRoute><PrintAgenda /></ProtectedRoute>} />
            <Route path="/cronogramas" element={<ProtectedRoute><Schedules /></ProtectedRoute>} />
            <Route path="/cronogramas/novo" element={<ProtectedRoute><ScheduleNew /></ProtectedRoute>} />
            <Route path="/cronogramas/:id" element={<ProtectedRoute><ScheduleEditor /></ProtectedRoute>} />
            <Route path="/cronogramas/:id/imprimir" element={<ProtectedRoute><SchedulePrint /></ProtectedRoute>} />
            <Route path="/cronogramas/:id/visualizar" element={<ProtectedRoute><ScheduleVisual /></ProtectedRoute>} />
            <Route path="/cronogramas/:id/termo" element={<ProtectedRoute><HandoffTerm /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
            <Route path="/clientes/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
            <Route path="/cobrar" element={<ProtectedRoute><BillingRequests /></ProtectedRoute>} />
            <Route path="/anotacoes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
