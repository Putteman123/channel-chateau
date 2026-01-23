import { useQuery } from '@tanstack/react-query';
import { 
  fetchAndParseM3u, 
  filterChannelsByCategory, 
  filterChannelsByType,
  M3UParseResult,
  M3UChannel,
  M3UCategory,
} from '@/lib/m3u-parser';

interface UseM3UDataOptions {
  m3uUrl: string | null;
  enabled?: boolean;
}

interface UseM3UDataResult {
  data: M3UParseResult | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  
  // Helper methods
  getLiveChannels: (categoryId?: string) => M3UChannel[];
  getMovies: (categoryId?: string) => M3UChannel[];
  getSeries: (categoryId?: string) => M3UChannel[];
  getLiveCategories: () => M3UCategory[];
  getMovieCategories: () => M3UCategory[];
  getSeriesCategories: () => M3UCategory[];
}

/**
 * Hook to fetch and parse M3U playlists with caching
 */
export function useM3UData({ m3uUrl, enabled = true }: UseM3UDataOptions): UseM3UDataResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['m3u-data', m3uUrl],
    queryFn: async () => {
      if (!m3uUrl) return null;
      return fetchAndParseM3u(m3uUrl, true);
    },
    enabled: enabled && !!m3uUrl,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  const getLiveChannels = (categoryId?: string): M3UChannel[] => {
    if (!data) return [];
    const liveChannels = filterChannelsByType(data.channels, 'live');
    return filterChannelsByCategory(liveChannels, categoryId);
  };

  const getMovies = (categoryId?: string): M3UChannel[] => {
    if (!data) return [];
    const movies = filterChannelsByType(data.channels, 'movie');
    return filterChannelsByCategory(movies, categoryId);
  };

  const getSeries = (categoryId?: string): M3UChannel[] => {
    if (!data) return [];
    const series = filterChannelsByType(data.channels, 'series');
    return filterChannelsByCategory(series, categoryId);
  };

  // Get categories that have live channels
  const getLiveCategories = (): M3UCategory[] => {
    if (!data) return [];
    const liveChannels = filterChannelsByType(data.channels, 'live');
    const categoryIds = new Set(liveChannels.map(ch => ch.category_id));
    return data.categories.filter(cat => categoryIds.has(cat.category_id));
  };

  // Get categories that have movies
  const getMovieCategories = (): M3UCategory[] => {
    if (!data) return [];
    const movies = filterChannelsByType(data.channels, 'movie');
    const categoryIds = new Set(movies.map(ch => ch.category_id));
    return data.categories.filter(cat => categoryIds.has(cat.category_id));
  };

  // Get categories that have series
  const getSeriesCategories = (): M3UCategory[] => {
    if (!data) return [];
    const series = filterChannelsByType(data.channels, 'series');
    const categoryIds = new Set(series.map(ch => ch.category_id));
    return data.categories.filter(cat => categoryIds.has(cat.category_id));
  };

  return {
    data: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
    getLiveChannels,
    getMovies,
    getSeries,
    getLiveCategories,
    getMovieCategories,
    getSeriesCategories,
  };
}
