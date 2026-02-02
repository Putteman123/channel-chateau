import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { StreamProvider, useStream } from '@/contexts/StreamContext';
import { SpatialNavigationProvider, useSpatialNavigation } from '@/contexts/SpatialNavigationContext';
import { ExpiryWarningBanner } from '@/components/subscription/ExpiryWarningBanner';
import { AnnouncementBanner } from '@/components/announcements/AnnouncementBanner';
import { SyncOverlay } from '@/components/sync/SyncOverlay';
import { SyncStatusBadge } from '@/components/sync/SyncStatusBadge';
import { useSyncEngine } from '@/hooks/useSyncEngine';
import { Tv } from 'lucide-react';

function TvModeIndicator() {
  const { isTvMode } = useSpatialNavigation();
  
  if (!isTvMode) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg">
      <Tv className="h-3.5 w-3.5" />
      <span>TV-läge</span>
    </div>
  );
}

function AppLayoutInner() {
  const navigate = useNavigate();
  const { isTvMode } = useSpatialNavigation();
  const { sources, activeSource } = useStream();
  
  // Sync engine for IPTVX-like performance
  const { 
    syncProgress, 
    isSyncing, 
    needsInitialSync, 
    startFullSync, 
    startDeltaSync,
    cacheStats 
  } = useSyncEngine();

  // Handle back navigation in TV mode
  useEffect(() => {
    const handleBack = () => {
      navigate(-1);
    };

    window.addEventListener('spatial-back', handleBack);
    return () => window.removeEventListener('spatial-back', handleBack);
  }, [navigate]);
  
  // Trigger initial sync if needed
  useEffect(() => {
    if (needsInitialSync && activeSource && !isSyncing) {
      startFullSync();
    }
  }, [needsInitialSync, activeSource, isSyncing, startFullSync]);
  
  // Background delta sync on app focus
  useEffect(() => {
    const handleFocus = () => {
      if (!needsInitialSync && activeSource && !isSyncing) {
        startDeltaSync();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [needsInitialSync, activeSource, isSyncing, startDeltaSync]);

  // Show sync overlay during initial sync
  if (syncProgress.stage !== 'idle' && syncProgress.isInitialSync) {
    return <SyncOverlay syncProgress={syncProgress} onRetry={startFullSync} />;
  }

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
            <div className="ml-auto">
              <SyncStatusBadge
                channelCount={cacheStats.channelCount}
                vodCount={cacheStats.vodCount}
                seriesCount={cacheStats.seriesCount}
                lastSync={cacheStats.lastSync}
                onRefresh={startDeltaSync}
                isRefreshing={isSyncing}
              />
            </div>
          </header>
          <div className="p-6">
            <AnnouncementBanner />
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

// Wrapper that ensures providers are initialized before inner content renders
function AppLayoutContent() {
  return (
    <StreamProvider>
      <SpatialNavigationProvider>
        <AppLayoutInner />
      </SpatialNavigationProvider>
    </StreamProvider>
  );
}

export function AppLayout() {
  return <AppLayoutContent />;
}
