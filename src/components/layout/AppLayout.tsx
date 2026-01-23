import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { StreamProvider, useStream } from '@/contexts/StreamContext';
import { SpatialNavigationProvider, useSpatialNavigation } from '@/contexts/SpatialNavigationContext';
import { ExpiryWarningBanner } from '@/components/subscription/ExpiryWarningBanner';
import { Tv } from 'lucide-react';

function TvModeIndicator() {
  const { isTvMode } = useSpatialNavigation();
  
  if (!isTvMode) return null;
  
  return (
    <div className="tv-mode-indicator flex items-center gap-1.5">
      <Tv className="h-3.5 w-3.5" />
      <span>TV-läge</span>
    </div>
  );
}

function AppLayoutContent() {
  const navigate = useNavigate();
  const { isTvMode } = useSpatialNavigation();
  const { sources } = useStream();

  // Handle back navigation in TV mode
  useEffect(() => {
    const handleBack = () => {
      navigate(-1);
    };

    window.addEventListener('spatial-back', handleBack);
    return () => window.removeEventListener('spatial-back', handleBack);
  }, [navigate]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
            <SidebarTrigger />
            {isTvMode && (
              <span className="text-xs text-muted-foreground">
                Använd piltangenter för att navigera
              </span>
            )}
          </header>
          <div className="p-6">
            <ExpiryWarningBanner sources={sources} />
            <div className="mt-4">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
      <TvModeIndicator />
    </SidebarProvider>
  );
}

export function AppLayout() {
  return (
    <StreamProvider>
      <SpatialNavigationProvider>
        <AppLayoutContent />
      </SpatialNavigationProvider>
    </StreamProvider>
  );
}
