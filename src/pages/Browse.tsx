import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useFavorites } from '@/hooks/useFavorites';
import { HeroBanner } from '@/components/content/HeroBanner';
import { ContentCarousel } from '@/components/content/ContentCarousel';
import { PosterCard } from '@/components/content/PosterCard';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { LoadError } from '@/components/content/LoadError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as XtreamAPI from '@/lib/xtream-api';

export default function Browse() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSource, credentials, sources } = useStream();
  const { continueWatching, getProgress } = useWatchHistory(activeSource?.id);
  const { favorites, isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);

  // Fetch live channels
  const { data: liveChannels, isLoading: loadingChannels, error: channelsError, refetch: refetchChannels, isRefetching: isRefetchingChannels } = useQuery({
    queryKey: ['live-channels', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getLiveStreams(credentials);
    },
    enabled: !!credentials,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch movies
  const { data: movies, isLoading: loadingMovies, error: moviesError, refetch: refetchMovies, isRefetching: isRefetchingMovies } = useQuery({
    queryKey: ['movies', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getVodStreams(credentials);
    },
    enabled: !!credentials,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch series
  const { data: series, isLoading: loadingSeries, error: seriesError, refetch: refetchSeries, isRefetching: isRefetchingSeries } = useQuery({
    queryKey: ['series', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getSeries(credentials);
    },
    enabled: !!credentials,
    staleTime: 5 * 60 * 1000,
  });

  // Build hero items from top-rated movies/series
  const heroItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      description?: string;
      backdrop?: string;
      poster?: string;
      type: 'movie' | 'series';
      year?: string;
      rating?: number | string;
    }> = [];

    // Add top movies
    if (movies) {
      const topMovies = movies
        .filter((m) => m.rating_5based && Number(m.rating_5based) > 3)
        .slice(0, 3);
      
      topMovies.forEach((movie) => {
        items.push({
          id: String(movie.stream_id),
          title: movie.name,
          poster: movie.stream_icon,
          type: 'movie',
          rating: movie.rating_5based,
        });
      });
    }

    // Add top series
    if (series) {
      const topSeries = series
        .filter((s) => s.rating_5based && Number(s.rating_5based) > 3)
        .slice(0, 2);
      
      topSeries.forEach((s) => {
        items.push({
          id: String(s.series_id),
          title: s.name,
          poster: s.cover,
          type: 'series',
          rating: s.rating_5based,
        });
      });
    }

    return items.slice(0, 5);
  }, [movies, series]);

  const handleToggleFavorite = (itemType: 'channel' | 'movie' | 'series', itemId: string, name: string, poster?: string) => {
    if (!activeSource) return;
    
    if (isFavorite(activeSource.id, itemType, itemId)) {
      removeFavorite.mutate({ streamSourceId: activeSource.id, itemType, itemId });
    } else {
      addFavorite.mutate({
        stream_source_id: activeSource.id,
        item_type: itemType,
        item_id: itemId,
        item_name: name,
        item_poster: poster || null,
      });
    }
  };

  const handleHeroPlay = (item: { id: string; type: 'movie' | 'series' }) => {
    navigate(`/${item.type}/${item.id}`);
  };

  // No sources configured
  if (sources.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md border-border bg-card text-center">
          <CardHeader>
            <CardTitle className="text-foreground">{t('browse.noSources')}</CardTitle>
            <CardDescription>
              {t('browse.noSourcesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/settings/sources">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t('browse.addSource')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = loadingChannels || loadingMovies || loadingSeries;
  const hasError = channelsError || moviesError || seriesError;
  const isRetrying = isRefetchingChannels || isRefetchingMovies || isRefetchingSeries;

  const handleRetry = () => {
    if (channelsError) refetchChannels();
    if (moviesError) refetchMovies();
    if (seriesError) refetchSeries();
  };

  if (isLoading) {
    return <ContentSkeleton type="row" />;
  }

  if (hasError) {
    const firstError = channelsError || moviesError || seriesError;
    return (
      <LoadError 
        onRetry={handleRetry}
        isRetrying={isRetrying}
        error={firstError}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      {heroItems.length > 0 && (
        <HeroBanner
          items={heroItems}
          onPlay={handleHeroPlay}
          onInfo={(item) => navigate(`/${item.type}/${item.id}`)}
        />
      )}

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <ContentCarousel title={t('browse.continueWatching')}>
          {continueWatching.slice(0, 10).map((item) => (
            <PosterCard
              key={item.id}
              id={item.item_id}
              title={item.item_name || t('common.unknown')}
              poster={item.item_poster || undefined}
              type={item.item_type === 'episode' ? 'series' : item.item_type as 'channel' | 'movie' | 'series'}
              progress={getProgress(item.stream_source_id, item.item_type, item.item_id)}
            />
          ))}
        </ContentCarousel>
      )}

      {/* Favorites */}
      {favorites.length > 0 && (
        <ContentCarousel title={t('browse.favorites')}>
          {favorites.slice(0, 10).map((fav) => (
            <PosterCard
              key={fav.id}
              id={fav.item_id}
              title={fav.item_name || t('common.unknown')}
              poster={fav.item_poster || undefined}
              type={fav.item_type}
              isFavorite={true}
              onToggleFavorite={() => handleToggleFavorite(fav.item_type, fav.item_id, fav.item_name || '', fav.item_poster || undefined)}
            />
          ))}
        </ContentCarousel>
      )}

      {/* Live TV */}
      {liveChannels && liveChannels.length > 0 && (
        <ContentCarousel title={t('browse.liveTV')} viewAllLink="/live">
          {liveChannels.slice(0, 15).map((channel) => (
            <PosterCard
              key={channel.stream_id}
              id={String(channel.stream_id)}
              title={channel.name}
              poster={channel.stream_icon}
              type="channel"
              variant="landscape"
              isFavorite={isFavorite(activeSource!.id, 'channel', String(channel.stream_id))}
              onToggleFavorite={() => handleToggleFavorite('channel', String(channel.stream_id), channel.name, channel.stream_icon)}
            />
          ))}
        </ContentCarousel>
      )}

      {/* Movies - Stående poster (2:3) */}
      {movies && movies.length > 0 && (
        <ContentCarousel title={t('browse.movies')} viewAllLink="/movies">
          {movies.slice(0, 15).map((movie) => (
            <PosterCard
              key={movie.stream_id}
              id={String(movie.stream_id)}
              title={movie.name}
              poster={movie.stream_icon}
              type="movie"
              rating={movie.rating_5based}
              variant="poster"
              isFavorite={isFavorite(activeSource!.id, 'movie', String(movie.stream_id))}
              onToggleFavorite={() => handleToggleFavorite('movie', String(movie.stream_id), movie.name, movie.stream_icon)}
            />
          ))}
        </ContentCarousel>
      )}

      {/* Series - Stående poster */}
      {series && series.length > 0 && (
        <ContentCarousel title={t('browse.series')} viewAllLink="/series">
          {series.slice(0, 15).map((s) => (
            <PosterCard
              key={s.series_id}
              id={String(s.series_id)}
              title={s.name}
              poster={s.cover}
              type="series"
              rating={s.rating_5based}
              variant="poster"
              isFavorite={isFavorite(activeSource!.id, 'series', String(s.series_id))}
              onToggleFavorite={() => handleToggleFavorite('series', String(s.series_id), s.name, s.cover)}
            />
          ))}
        </ContentCarousel>
      )}
    </div>
  );
}
