import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/aceite/:id" element={<GuestAccept />} />
            <Route path="/c/:token" element={<SchedulePublic />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/agenda" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/treinamento/:id" element={<ProtectedRoute><TrainingDetail /></ProtectedRoute>} />
            <Route path="/treinamento/:id/termo" element={<ProtectedRoute><TrainingTerm /></ProtectedRoute>} />
            <Route path="/agenda/imprimir" element={<ProtectedRoute><PrintAgenda /></ProtectedRoute>} />
            <Route path="/cronogramas" element={<ProtectedRoute><Schedules /></ProtectedRoute>} />
            <Route path="/cronogramas/novo" element={<ProtectedRoute><ScheduleNew /></ProtectedRoute>} />
            <Route path="/cronogramas/:id" element={<ProtectedRoute><ScheduleEditor /></ProtectedRoute>} />
            <Route path="/cronogramas/:id/imprimir" element={<ProtectedRoute><SchedulePrint /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
