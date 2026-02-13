import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TrendingItem {
  title: string;
  year: number;
  description: string;
  poster?: string;
  tmdb_id?: number;
}

export interface TrendingContent {
  movies: TrendingItem[];
  series: TrendingItem[];
}

const TMDB_API_KEY = '559363469bbb3aefbab797b3799c1bae'; // public TMDB key
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

async function fetchTMDBPoster(title: string, type: 'movie' | 'tv'): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=sv-SE`
    );
    const data = await res.json();
    const result = data.results?.[0];
    if (result?.poster_path) {
      return `${TMDB_IMG}${result.poster_path}`;
    }
  } catch {}
  return undefined;
}

async function enrichWithPosters(items: TrendingItem[], type: 'movie' | 'tv'): Promise<TrendingItem[]> {
  const enriched = await Promise.all(
    items.map(async (item) => {
      const poster = await fetchTMDBPoster(item.title, type);
      return { ...item, poster };
    })
  );
  return enriched;
}

async function fetchTrending(): Promise<TrendingContent> {
  const { data, error } = await supabase.functions.invoke('perplexity-trending');
  if (error) throw error;
  
  const raw = data as TrendingContent;
  
  // Enrich with TMDB posters in parallel
  const [movies, series] = await Promise.all([
    enrichWithPosters(raw.movies || [], 'movie'),
    enrichWithPosters(raw.series || [], 'tv'),
  ]);
  
  return { movies, series };
}

export function useTrendingContent() {
  return useQuery({
    queryKey: ['trending-content'],
    queryFn: fetchTrending,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    gcTime: 48 * 60 * 60 * 1000,
    retry: 1,
  });
}
