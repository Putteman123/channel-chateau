/**
 * Hook for fetching and caching XMLTV EPG data
 */

import { useQuery } from '@tanstack/react-query';
import { parseXMLTV, XMLTVData, XMLTVProgram, matchChannelToPrograms } from '@/lib/xmltv-parser';
import { getProxyBaseUrl } from '@/lib/proxy-config';

interface UseXMLTVEpgOptions {
  /** Custom EPG URL (e.g., http://domain/xmltv.php?username=...) */
  epgUrl: string | null | undefined;
  /** Whether to enable fetching */
  enabled?: boolean;
}

interface UseXMLTVEpgResult {
  data: XMLTVData | null;
  isLoading: boolean;
  error: Error | null;
  /** Get programs for a specific channel */
  getProgramsForChannel: (
    streamId: number,
    epgChannelId: string | undefined,
    channelName: string
  ) => XMLTVProgram[];
}

/**
 * Fetch and cache XMLTV EPG data for a stream source
 */
export function useXMLTVEpg({ epgUrl, enabled = true }: UseXMLTVEpgOptions): UseXMLTVEpgResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['xmltv-epg', epgUrl],
    queryFn: async (): Promise<XMLTVData> => {
      if (!epgUrl) throw new Error('No EPG URL provided');
      
      // Route through proxy to handle Mixed Content and CORS
      const proxyBase = getProxyBaseUrl();
      const proxiedUrl = `${proxyBase}?url=${encodeURIComponent(epgUrl)}`;
      
      console.log('[useXMLTVEpg] Fetching XMLTV from:', epgUrl.substring(0, 60) + '...');
      
      const response = await fetch(proxiedUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch EPG: HTTP ${response.status}`);
      }
      
      const xmlText = await response.text();
      
      if (!xmlText.includes('<tv') && !xmlText.includes('<TV')) {
        throw new Error('Invalid XMLTV response - not XML format');
      }
      
      return parseXMLTV(xmlText);
    },
    enabled: enabled && !!epgUrl,
    staleTime: 30 * 60 * 1000, // 30 minutes - EPG data changes slowly
    gcTime: 60 * 60 * 1000, // 1 hour cache
    retry: 2,
  });

  const getProgramsForChannel = (
    streamId: number,
    epgChannelId: string | undefined,
    channelName: string
  ): XMLTVProgram[] => {
    if (!data) return [];
    return matchChannelToPrograms(streamId, epgChannelId, channelName, data);
  };

  return {
    data: data || null,
    isLoading,
    error: error as Error | null,
    getProgramsForChannel,
  };
}
