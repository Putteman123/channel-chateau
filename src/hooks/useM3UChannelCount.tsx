import { useQuery } from '@tanstack/react-query';
import { fetchAndParseM3u } from '@/lib/m3u-parser';

interface UseM3UChannelCountOptions {
  m3uUrl: string | null;
  enabled?: boolean;
}

/**
 * Hook to get the channel count from an M3U playlist
 * Uses a lightweight query that caches the result
 */
export function useM3UChannelCount({ m3uUrl, enabled = true }: UseM3UChannelCountOptions) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['m3u-channel-count', m3uUrl],
    queryFn: async () => {
      if (!m3uUrl) return null;
      const result = await fetchAndParseM3u(m3uUrl, true);
      return {
        totalChannels: result.channels.length,
        liveChannels: result.channels.filter(ch => ch.stream_type === 'live').length,
        movies: result.channels.filter(ch => ch.stream_type === 'movie').length,
        series: result.channels.filter(ch => ch.stream_type === 'series').length,
        categories: result.categories.length,
      };
    },
    enabled: enabled && !!m3uUrl,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  return {
    channelCount: data,
    isLoading,
    error: error as Error | null,
  };
}
