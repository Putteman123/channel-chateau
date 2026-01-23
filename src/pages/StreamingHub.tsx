import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useOrientation } from '@/hooks/useOrientation';
import { ContentCard } from '@/components/content/ContentCard';
import { ProviderCard } from '@/components/content/ProviderCard';
import { SearchBar } from '@/components/content/SearchBar';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { LoadError } from '@/components/content/LoadError';
import { VirtualizedGrid } from '@/components/content/VirtualizedGrid';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as XtreamAPI from '@/lib/xtream-api';

// Known streaming provider keywords
const PROVIDER_KEYWORDS = [
  'Netflix',
  'HBO',
  'Disney',
  'Amazon',
  'Prime',
  'Apple',
  'Hulu',
  'Paramount',
  'Peacock',
  'Max',
  'Crunchyroll',
  'Showtime',
  'Starz',
  'Mubi',
  'Criterion',
];

interface Provider {
  name: string;
  keywords: string[];
  movieCategoryIds: string[];
  seriesCategoryIds: string[];
  movieCount: number;
  seriesCount: number;
}

export default function StreamingHub() {
  const { t } = useTranslation();
  const { activeSource, credentials } = useStream();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  const { updateHistory, getProgress } = useWatchHistory(activeSource?.id);
  const { isLandscapeMobile } = useOrientation();

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<XtreamAPI.XtreamMovie | null>(null);
  const [contentType, setContentType] = useState<'movies' | 'series'>('movies');

  // Fetch VOD categories
  const { data: vodCategories } = useQuery({
    queryKey: ['vod-categories', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getVodCategories(credentials);
    },
    enabled: !!credentials,
  });

  // Fetch series categories
  const { data: seriesCategories } = useQuery({
    queryKey: ['series-categories', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getSeriesCategories(credentials);
    },
    enabled: !!credentials,
  });

  // Fetch all movies
  const { data: allMovies, isLoading: loadingMovies, error: moviesError, refetch: refetchMovies, isRefetching: isRefetchingMovies } = useQuery({
    queryKey: ['all-movies', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getVodStreams(credentials);
    },
    enabled: !!credentials,
  });

  // Fetch all series
  const { data: allSeries, isLoading: loadingSeries, error: seriesError, refetch: refetchSeries, isRefetching: isRefetchingSeries } = useQuery({
    queryKey: ['all-series', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getSeries(credentials);
    },
    enabled: !!credentials,
  });

  // Build providers from categories
  const providers = useMemo(() => {
    if (!vodCategories && !seriesCategories) return [];

    const providerMap = new Map<string, Provider>();

    // Process VOD categories
    vodCategories?.forEach((cat) => {
      const categoryName = cat.category_name.toLowerCase();
      for (const keyword of PROVIDER_KEYWORDS) {
        if (categoryName.includes(keyword.toLowerCase())) {
          const existing = providerMap.get(keyword) || {
            name: keyword,
            keywords: [keyword.toLowerCase()],
            movieCategoryIds: [],
            seriesCategoryIds: [],
            movieCount: 0,
            seriesCount: 0,
          };
          existing.movieCategoryIds.push(cat.category_id);
          providerMap.set(keyword, existing);
          break;
        }
      }
    });

    // Process series categories
    seriesCategories?.forEach((cat) => {
      const categoryName = cat.category_name.toLowerCase();
      for (const keyword of PROVIDER_KEYWORDS) {
        if (categoryName.includes(keyword.toLowerCase())) {
          const existing = providerMap.get(keyword) || {
            name: keyword,
            keywords: [keyword.toLowerCase()],
            movieCategoryIds: [],
            seriesCategoryIds: [],
            movieCount: 0,
            seriesCount: 0,
          };
          existing.seriesCategoryIds.push(cat.category_id);
          providerMap.set(keyword, existing);
          break;
        }
      }
    });

    // Count content for each provider
    providerMap.forEach((provider) => {
      provider.movieCount = allMovies?.filter((m) =>
        provider.movieCategoryIds.includes(m.category_id)
      ).length || 0;
      provider.seriesCount = allSeries?.filter((s) =>
        provider.seriesCategoryIds.includes(s.category_id)
      ).length || 0;
    });

    // Filter out providers with no content
    return Array.from(providerMap.values())
      .filter((p) => p.movieCount > 0 || p.seriesCount > 0)
      .sort((a, b) => (b.movieCount + b.seriesCount) - (a.movieCount + a.seriesCount));
  }, [vodCategories, seriesCategories, allMovies, allSeries]);

  // Filter content based on selected provider
  const filteredMovies = useMemo(() => {
    if (!allMovies) return [];

    let movies = allMovies;

    // Filter by provider
    if (selectedProvider) {
      const provider = providers.find((p) => p.name === selectedProvider);
      if (provider) {
        movies = movies.filter((m) => provider.movieCategoryIds.includes(m.category_id));
      }
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      movies = movies.filter((m) => m.name.toLowerCase().includes(query));
    }

    return movies;
  }, [allMovies, selectedProvider, providers, searchQuery]);

  const filteredSeries = useMemo(() => {
    if (!allSeries) return [];

    let series = allSeries;

    // Filter by provider
    if (selectedProvider) {
      const provider = providers.find((p) => p.name === selectedProvider);
      if (provider) {
        series = series.filter((s) => provider.seriesCategoryIds.includes(s.category_id));
      }
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      series = series.filter((s) => s.name.toLowerCase().includes(query));
    }

    return series;
  }, [allSeries, selectedProvider, providers, searchQuery]);

  const handleToggleFavorite = (type: 'movie' | 'series', id: string, name: string, poster?: string) => {
    if (!activeSource) return;

    if (isFavorite(activeSource.id, type, id)) {
      removeFavorite.mutate({ streamSourceId: activeSource.id, itemType: type, itemId: id });
    } else {
      addFavorite.mutate({
        stream_source_id: activeSource.id,
        item_type: type,
        item_id: id,
        item_name: name,
        item_poster: poster || null,
      });
    }
  };

  const getStreamUrl = (movie: XtreamAPI.XtreamMovie) => {
    if (!credentials) return '';
    return XtreamAPI.buildMovieStreamUrl(credentials, movie.stream_id, movie.container_extension || 'mp4');
  };

  const handleProgress = (currentTime: number, duration: number) => {
    if (!activeSource || !selectedMovie) return;

    updateHistory.mutate({
      stream_source_id: activeSource.id,
      item_type: 'movie',
      item_id: String(selectedMovie.stream_id),
      item_name: selectedMovie.name,
      item_poster: selectedMovie.stream_icon || null,
      position_seconds: Math.floor(currentTime),
      duration_seconds: Math.floor(duration),
      series_id: null,
      season_num: null,
      episode_num: null,
    });
  };

  const handleProviderClick = (providerName: string) => {
    setSelectedProvider(selectedProvider === providerName ? null : providerName);
  };

  if (!credentials) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">{t('movies.noSource')}</p>
      </div>
    );
  }

  const isLoading = loadingMovies || loadingSeries;
  const hasError = moviesError || seriesError;
  const isRetrying = isRefetchingMovies || isRefetchingSeries;

  const handleRetry = () => {
    if (moviesError) refetchMovies();
    if (seriesError) refetchSeries();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('streamingHub.title')}</h1>
        <p className="text-muted-foreground">{t('streamingHub.description')}</p>
      </div>

      {/* Provider Icons */}
      {providers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('streamingHub.providers')}</h2>
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4">
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.name}
                  name={provider.name}
                  isSelected={selectedProvider === provider.name}
                  onClick={() => handleProviderClick(provider.name)}
                  count={contentType === 'movies' ? provider.movieCount : provider.seriesCount}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('streamingHub.searchContent')}
          />
        </div>
      </div>

      {/* Content Tabs */}
      <Tabs value={contentType} onValueChange={(v) => setContentType(v as 'movies' | 'series')}>
        <TabsList>
          <TabsTrigger value="movies">
            {t('nav.movies')} ({filteredMovies.length})
          </TabsTrigger>
          <TabsTrigger value="series">
            {t('nav.series')} ({filteredSeries.length})
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="pt-6">
            <ContentSkeleton count={12} />
          </div>
        ) : hasError ? (
          <div className="pt-6">
            <LoadError onRetry={handleRetry} isRetrying={isRetrying} />
          </div>
        ) : (
          <>
            <TabsContent value="movies" className="mt-6">
              <VirtualizedGrid
                items={filteredMovies}
                keyExtractor={(movie) => movie.stream_id}
                emptyMessage={t('movies.noMovies')}
                renderItem={(movie) => (
                  <ContentCard
                    id={String(movie.stream_id)}
                    title={movie.name}
                    poster={movie.stream_icon}
                    type="movie"
                    rating={movie.rating_5based}
                    progress={getProgress(activeSource!.id, 'movie', String(movie.stream_id))}
                    isFavorite={isFavorite(activeSource!.id, 'movie', String(movie.stream_id))}
                    onPlay={() => setSelectedMovie(movie)}
                    onToggleFavorite={() => handleToggleFavorite('movie', String(movie.stream_id), movie.name, movie.stream_icon)}
                  />
                )}
              />
            </TabsContent>

            <TabsContent value="series" className="mt-6">
              <VirtualizedGrid
                items={filteredSeries}
                keyExtractor={(s) => s.series_id}
                emptyMessage={t('series.noSeries')}
                renderItem={(s) => (
                  <ContentCard
                    id={String(s.series_id)}
                    title={s.name}
                    poster={s.cover}
                    type="series"
                    rating={s.rating_5based}
                    isFavorite={isFavorite(activeSource!.id, 'series', String(s.series_id))}
                    onToggleFavorite={() => handleToggleFavorite('series', String(s.series_id), s.name, s.cover)}
                  />
                )}
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Video Player */}
      {isLandscapeMobile && selectedMovie ? (
        <div className="fixed inset-0 z-50 bg-black">
          <VideoPlayer
            src={getStreamUrl(selectedMovie)}
            title={selectedMovie.name}
            poster={selectedMovie.stream_icon}
            onProgress={handleProgress}
            onClose={() => setSelectedMovie(null)}
          />
        </div>
      ) : (
        <Dialog open={!!selectedMovie} onOpenChange={() => setSelectedMovie(null)}>
          <DialogContent className="max-w-4xl p-0">
            {selectedMovie && (
              <VideoPlayer
                src={getStreamUrl(selectedMovie)}
                title={selectedMovie.name}
                poster={selectedMovie.stream_icon}
                onProgress={handleProgress}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
