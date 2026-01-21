import { createContext, useContext, useState, ReactNode } from 'react';
import { useStreamSources, StreamSource } from '@/hooks/useStreamSources';
import { XtreamCredentials } from '@/lib/xtream-api';

interface StreamContextType {
  sources: StreamSource[];
  activeSource: StreamSource | undefined;
  credentials: XtreamCredentials | null;
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

  const credentials: XtreamCredentials | null = currentSource 
    ? {
        serverUrl: currentSource.server_url,
        username: currentSource.username,
        password: currentSource.password,
      }
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
      credentials,
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
