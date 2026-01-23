import { createContext, useContext, useState, ReactNode } from 'react';
import { useStreamSources, StreamSource, SourceType } from '@/hooks/useStreamSources';
import { XtreamCredentials } from '@/lib/xtream-api';

interface StreamContextType {
  sources: StreamSource[];
  activeSource: StreamSource | undefined;
  sourceType: SourceType;
  // For Xtream sources
  credentials: XtreamCredentials | null;
  // For M3U sources
  m3uUrl: string | null;
  // Stream preferences
  preferTsLive: boolean;
  preferTsVod: boolean;
  useProxy: boolean;
  isLoading: boolean;
  setActiveSourceId: (id: string) => void;
}

const StreamContext = createContext<StreamContextType | undefined>(undefined);

export function StreamProvider({ children }: { children: ReactNode }) {
  const { sources, activeSource, isLoading, updateSource } = useStreamSources();
  const [activeId, setActiveId] = useState<string | null>(null);

  const currentSource = activeId 
    ? sources.find(s => s.id === activeId) 
    : activeSource;

  const sourceType: SourceType = currentSource?.source_type ?? 'xtream';

  // Build Xtream credentials if applicable
  const credentials: XtreamCredentials | null = currentSource && currentSource.source_type === 'xtream'
    ? {
        serverUrl: currentSource.server_url || '',
        username: currentSource.username || '',
        password: currentSource.password || '',
      }
    : null;

  // M3U URL if applicable
  const m3uUrl: string | null = currentSource?.source_type === 'm3u' 
    ? currentSource.m3u_url 
    : null;

  const setActiveSourceId = (id: string) => {
    setActiveId(id);
    // Mark as active in database
    updateSource.mutate({ id, is_active: true });
    // Mark others as inactive
    sources.forEach(s => {
      if (s.id !== id && s.is_active) {
        updateSource.mutate({ id: s.id, is_active: false });
      }
    });
  };

  return (
    <StreamContext.Provider value={{
      sources,
      activeSource: currentSource,
      sourceType,
      credentials,
      m3uUrl,
      preferTsLive: currentSource?.prefer_ts_live ?? true,
      preferTsVod: currentSource?.prefer_ts_vod ?? true,
      useProxy: currentSource?.use_proxy ?? true,
      isLoading,
      setActiveSourceId,
    }}>
      {children}
    </StreamContext.Provider>
  );
}

export function useStream() {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error('useStream must be used within a StreamProvider');
  }
  return context;
}
