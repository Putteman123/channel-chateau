import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tv, Film, Clapperboard, Radio, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useFavorites } from '@/hooks/useFavorites';
import { useTrendingContent } from '@/hooks/useTrendingContent';
import { ContentCarousel } from '@/components/content/ContentCarousel';
import { GeminiCommandCenter } from '@/components/ai/GeminiCommandCenter';
import { PosterCard } from '@/components/content/PosterCard';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { LoadError } from '@/components/content/LoadError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelCache, VODCache, SeriesCache, SyncMeta } from '@/lib/local-cache';
import * as XtreamAPI from '@/lib/xtream-api';
import { getImageProxyUrl } from '@/lib/stream-utils';
import { toast } from 'sonner';

export default function Browse() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSource, credentials, sources } = useStream();
  const { continueWatching, getProgress } = useWatchHistory(activeSource?.id);
  const { favorites, isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  const { data: trending } = useTrendingContent();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const sourceId = activeSource?.id;

  const handleFullSync = async () => {
    if (!credentials || !sourceId || isSyncing) return;
    setIsSyncing(true);
    toast.info('Uppdaterar biblioteket...');
    try {
      const [channels, movies, series] = await Promise.all([
        XtreamAPI.getLiveStreams(credentials),
        XtreamAPI.getVodStreams(credentials),
        XtreamAPI.getSeries(credentials),
      ]);
      await Promise.all([
        ChannelCache.set(sourceId, channels),
        VODCache.set(sourceId, movies),
        SeriesCache.set(sourceId, series),
        SyncMeta.set(sourceId, {
          lastFullSync: Date.now(),
          channelCount: channels.length,
          vodCount: movies.length,
          seriesCount: series.length,
        }),
      ]);
      queryClient.invalidateQueries({ queryKey: ['live-channels'] });
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['series'] });
      toast.success(`Biblioteket uppdaterat! ${channels.length} kanaler, ${movies.length} filmer, ${series.length} serier`);
    } catch (e) {
      toast.error('Uppdatering misslyckades');
      console.error('[Browse] Full sync error:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const { data: liveChannels, isLoading: loadingChannels, error: channelsError, refetch: refetchChannels } = useQuery({
    queryKey: ['live-channels', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      const res = await XtreamAPI.getLiveStreams(credentials);
      return Array.isArray(res) ? res : [];
    },
    enabled: !!credentials,
    staleTime: 3 * 24 * 60 * 60 * 1000,
  });

  const { data: movies, isLoading: loadingMovies, error: moviesError, refetch: refetchMovies } = useQuery({
    queryKey: ['movies', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      const res = await XtreamAPI.getVodStreams(credentials);
      return Array.isArray(res) ? res : [];
    },
    enabled: !!credentials,
    staleTime: 3 * 24 * 60 * 60 * 1000,
  });

  const { data: series, isLoading: loadingSeries, error: seriesError, refetch: refetchSeries } = useQuery({
    queryKey: ['series', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      const res = await XtreamAPI.getSeries(credentials);
      return Array.isArray(res) ? res : [];
    },
    enabled: !!credentials,
    staleTime: 3 * 24 * 60 * 60 * 1000,
  });

  // === STATS ===
  const stats = useMemo(() => ({
    channels: liveChannels?.length ?? 0,
    movies: movies?.length ?? 0,
    series: series?.length ?? 0,
  }), [liveChannels, movies, series]);

  const featuredChannels = useMemo(() => {
    if (!liveChannels) return [];
    return liveChannels.filter(c => c.stream_icon).slice(0, 12);
  }, [liveChannels]);

  const recentMovies = useMemo(() => {
    if (!movies) return [];
    return movies.filter(m => m.stream_icon).slice(-20).reverse();
  }, [movies]);

  const topRatedMovies = useMemo(() => {
    if (!movies) return [];
    return movies
      .filter(m => m.rating_5based && Number(m.rating_5based) >= 3.5 && m.stream_icon)
      .sort((a, b) => Number(b.rating_5based || 0) - Number(a.rating_5based || 0))
      .slice(0, 15);
  }, [movies]);

  const topSeries = useMemo(() => {
    if (!series) return [];
    return series
      .filter(s => s.cover)
      .sort((a, b) => Number(b.rating_5based || 0) - Number(a.rating_5based || 0))
      .slice(0, 15);
  }, [series]);

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

  if (sources.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md border-border bg-card text-center">
          <CardHeader>
            <CardTitle className="text-foreground">{t('browse.noSources')}</CardTitle>
            <CardDescription>{t('browse.noSourcesDesc')}</CardDescription>
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

  const isLoading = loadingChannels && loadingMovies && loadingSeries;
  const hasError = channelsError && moviesError && seriesError;

  if (isLoading) return <ContentSkeleton type="row" />;
  if (hasError) {
    return (
      <LoadError
        onRetry={() => { refetchChannels(); refetchMovies(); refetchSeries(); }}
        error={channelsError || moviesError || seriesError}
      />
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* === QUICK STATS + REFRESH === */}
      <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-hide">
        <Link to="/live" className="flex shrink-0 items-center gap-2 rounded-xl bg-primary/15 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/25">
          <Radio className="h-4 w-4" />
          <span>{stats.channels} kanaler</span>
        </Link>
        <Link to="/movies" className="flex shrink-0 items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80">
          <Film className="h-4 w-4" />
          <span>{stats.movies} filmer</span>
        </Link>
        <Link to="/series" className="flex shrink-0 items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80">
          <Clapperboard className="h-4 w-4" />
          <span>{stats.series} serier</span>
        </Link>
        <button
          onClick={handleFullSync}
          disabled={isSyncing}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-accent/15 px-4 py-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Uppdaterar...' : 'Uppdatera'}</span>
        </button>
      </div>

      {/* === CONTINUE WATCHING === */}
      {continueWatching.length > 0 && (
        <ContentCarousel title={t('browse.continueWatching')} viewAllLink="/continue">
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

      {/* === GEMINI COMMAND CENTER === */}
      <GeminiCommandCenter stats={stats} />

      {/* === LIVE TV === */}
      {featuredChannels.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Tv className="h-4 w-4 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-semibold text-foreground lg:text-2xl">Live TV</h2>
            </div>
            <Link to="/live" className="text-sm text-muted-foreground transition-colors hover:text-primary">
              Alla kanaler →
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {featuredChannels.map((channel) => (
              <button key={channel.stream_id} onClick={() => navigate(`/channel/${channel.stream_id}`)} className="group relative shrink-0">
                <div className="relative h-20 w-32 overflow-hidden rounded-xl bg-gradient-to-br from-muted to-muted/50 transition-all duration-200 group-hover:scale-105 group-hover:ring-2 group-hover:ring-primary group-hover:shadow-lg group-hover:shadow-primary/20 sm:h-24 sm:w-40">
                  {channel.stream_icon ? (
                    <img src={getImageProxyUrl(channel.stream_icon)} alt={channel.name} className="h-full w-full object-contain p-3" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center"><span className="text-2xl">📺</span></div>
                  )}
                  <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-primary-foreground" />LIVE
                  </div>
                </div>
                <p className="mt-1.5 max-w-[128px] truncate text-center text-xs text-muted-foreground group-hover:text-foreground sm:max-w-[160px]">{channel.name}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* === FAVORITES === */}
      {favorites.length > 0 && (
        <ContentCarousel title={t('browse.favorites')} viewAllLink="/favorites">
          {favorites.slice(0, 10).map((fav) => (
            <PosterCard key={fav.id} id={fav.item_id} title={fav.item_name || t('common.unknown')} poster={fav.item_poster || undefined} type={fav.item_type} isFavorite={true} onToggleFavorite={() => handleToggleFavorite(fav.item_type, fav.item_id, fav.item_name || '', fav.item_poster || undefined)} />
          ))}
        </ContentCarousel>
      )}

      {/* === TOP RATED MOVIES === */}
      {topRatedMovies.length > 0 && (
        <ContentCarousel title="⭐ Populära filmer" viewAllLink="/movies">
          {topRatedMovies.map((movie) => (
            <PosterCard key={movie.stream_id} id={String(movie.stream_id)} title={movie.name} poster={movie.stream_icon} type="movie" rating={movie.rating_5based} variant="poster" isFavorite={isFavorite(activeSource!.id, 'movie', String(movie.stream_id))} onToggleFavorite={() => handleToggleFavorite('movie', String(movie.stream_id), movie.name, movie.stream_icon)} />
          ))}
        </ContentCarousel>
      )}

      {/* === RECENTLY ADDED === */}
      {recentMovies.length > 0 && (
        <ContentCarousel title="🆕 Nyligen tillagda" viewAllLink="/movies">
          {recentMovies.map((movie) => (
            <PosterCard key={movie.stream_id} id={String(movie.stream_id)} title={movie.name} poster={movie.stream_icon} type="movie" rating={movie.rating_5based} variant="poster" isFavorite={isFavorite(activeSource!.id, 'movie', String(movie.stream_id))} onToggleFavorite={() => handleToggleFavorite('movie', String(movie.stream_id), movie.name, movie.stream_icon)} />
          ))}
        </ContentCarousel>
      )}

      {/* === TOP SERIES === */}
      {topSeries.length > 0 && (
        <ContentCarousel title="📺 Populära serier" viewAllLink="/series">
          {topSeries.map((s) => (
            <PosterCard key={s.series_id} id={String(s.series_id)} title={s.name} poster={s.cover} type="series" rating={s.rating_5based} variant="poster" isFavorite={isFavorite(activeSource!.id, 'series', String(s.series_id))} onToggleFavorite={() => handleToggleFavorite('series', String(s.series_id), s.name, s.cover)} />
          ))}
        </ContentCarousel>
      )}
    </div>
  );
}
