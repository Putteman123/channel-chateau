import { useQuery } from '@tanstack/react-query';
import { getMetadata, cleanTitle, TMDBMetadata } from '@/lib/tmdb-api';

interface UseTMDBMetadataOptions {
  title: string;
  type: 'movie' | 'tv';
  enabled?: boolean;
}

/**
 * Hook to fetch and cache TMDB metadata for a single item
 */
export function useTMDBMetadata({ title, type, enabled = true }: UseTMDBMetadataOptions) {
  const cleanedTitle = cleanTitle(title);

  return useQuery({
    queryKey: ['tmdb-metadata', cleanedTitle, type],
    queryFn: () => getMetadata(title, type),
    enabled: enabled && !!cleanedTitle,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch and cache TMDB metadata for multiple items
 * Uses React Query's built-in deduplication
 */
export function useTMDBMetadataBatch(
  items: Array<{ id: string; title: string; type: 'movie' | 'tv' }>,
  enabled: boolean = true
) {
  // Create individual queries for each item
  // React Query will deduplicate based on queryKey
  const queries = items.map(item => ({
    queryKey: ['tmdb-metadata', cleanTitle(item.title), item.type] as const,
    queryFn: () => getMetadata(item.title, item.type),
    enabled: enabled && !!cleanTitle(item.title),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
    refetchOnWindowFocus: false,
  }));

  return queries;
}

/**
 * Simple cache access for pre-fetched TMDB data
 * Returns cached data if available, null otherwise
 */
export function getTMDBCacheKey(title: string, type: 'movie' | 'tv'): readonly [string, string, string] {
  return ['tmdb-metadata', cleanTitle(title), type] as const;
}

export type { TMDBMetadata };
