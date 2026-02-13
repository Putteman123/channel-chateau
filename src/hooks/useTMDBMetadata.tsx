import { useQuery } from '@tanstack/react-query';
import { getMetadata, getDetailedMetadata, cleanTitle, TMDBMetadata, TMDBDetailedMetadata } from '@/lib/tmdb-api';

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
 * Hook to fetch detailed TMDB metadata (cast, trailer, genres)
 */
export function useTMDBDetailedMetadata({ title, type, enabled = true }: UseTMDBMetadataOptions) {
  const cleanedTitle = cleanTitle(title);

  return useQuery<TMDBDetailedMetadata | null>({
    queryKey: ['tmdb-detailed', cleanedTitle, type],
    queryFn: () => getDetailedMetadata(title, type),
    enabled: enabled && !!cleanedTitle,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch and cache TMDB metadata for multiple items
 */
export function useTMDBMetadataBatch(
  items: Array<{ id: string; title: string; type: 'movie' | 'tv' }>,
  enabled: boolean = true
) {
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

export function getTMDBCacheKey(title: string, type: 'movie' | 'tv'): readonly [string, string, string] {
  return ['tmdb-metadata', cleanTitle(title), type] as const;
}

export type { TMDBMetadata, TMDBDetailedMetadata };
