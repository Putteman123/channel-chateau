import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import Browse from "./pages/Browse";
import LiveTV from "./pages/LiveTV";
import Movies from "./pages/Movies";
import Series from "./pages/Series";
import SeriesDetail from "./pages/SeriesDetail";
import Favorites from "./pages/Favorites";
import ContinueWatching from "./pages/ContinueWatching";
import Settings from "./pages/Settings";
import Profile from "./pages/settings/Profile";
import Sources from "./pages/settings/Sources";
import Language from "./pages/settings/Language";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            
            {/* Protected routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/browse" element={<Browse />} />
              <Route path="/live" element={<LiveTV />} />
              <Route path="/movies" element={<Movies />} />
              <Route path="/series" element={<Series />} />
              <Route path="/series/:id" element={<SeriesDetail />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/continue" element={<ContinueWatching />} />
              <Route path="/settings" element={<Settings />}>
                <Route index element={<Profile />} />
                <Route path="profile" element={<Profile />} />
                <Route path="sources" element={<Sources />} />
                <Route path="language" element={<Language />} />
              </Route>
            </Route>
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
