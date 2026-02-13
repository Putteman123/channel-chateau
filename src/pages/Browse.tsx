import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Tv, Film, Clapperboard, Radio, TrendingUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useFavorites } from '@/hooks/useFavorites';
import { useTrendingContent } from '@/hooks/useTrendingContent';
import { ContentCarousel } from '@/components/content/ContentCarousel';
import { PosterCard } from '@/components/content/PosterCard';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { LoadError } from '@/components/content/LoadError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelCache, VODCache, SeriesCache } from '@/lib/local-cache';
import * as XtreamAPI from '@/lib/xtream-api';
import { getImageProxyUrl } from '@/lib/stream-utils';

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

export default function Browse() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSource, credentials, sources } = useStream();
  const { continueWatching, getProgress } = useWatchHistory(activeSource?.id);
  const { favorites, isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  const { data: trending } = useTrendingContent();

  const sourceId = activeSource?.id;

  const { data: liveChannels, isLoading: loadingChannels, error: channelsError, refetch: refetchChannels } = useQuery({
    queryKey: ['live-channels', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      if (sourceId) {
        const cached = await ChannelCache.get(sourceId);
        if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
          const age = Date.now() - cached.timestamp;
          if (age < THREE_DAYS) {
            console.log(`[Browse] ⚡ Loaded ${cached.data.length} channels from cache (fresh)`);
            return cached.data as XtreamAPI.XtreamChannel[];
          }
          // Cache stale, return cached but refresh in bg
          XtreamAPI.getLiveStreams(credentials).then(fresh => {
            if (fresh.length > 0) ChannelCache.set(sourceId, fresh);
          }).catch(() => {});
          return cached.data as XtreamAPI.XtreamChannel[];
        }
      }
      return XtreamAPI.getLiveStreams(credentials);
    },
    enabled: !!credentials,
    staleTime: THREE_DAYS,
  });

  const { data: movies, isLoading: loadingMovies, error: moviesError, refetch: refetchMovies } = useQuery({
    queryKey: ['movies', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      if (sourceId) {
        const cached = await VODCache.get(sourceId);
        if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
          const age = Date.now() - cached.timestamp;
          if (age < THREE_DAYS) {
            return cached.data as XtreamAPI.XtreamMovie[];
          }
          XtreamAPI.getVodStreams(credentials).then(fresh => {
            if (fresh.length > 0) VODCache.set(sourceId, fresh);
          }).catch(() => {});
          return cached.data as XtreamAPI.XtreamMovie[];
        }
      }
      return XtreamAPI.getVodStreams(credentials);
    },
    enabled: !!credentials,
    staleTime: THREE_DAYS,
  });

  const { data: series, isLoading: loadingSeries, error: seriesError, refetch: refetchSeries } = useQuery({
    queryKey: ['series', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      if (sourceId) {
        const cached = await SeriesCache.get(sourceId);
        if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
          const age = Date.now() - cached.timestamp;
          if (age < THREE_DAYS) {
            return cached.data as XtreamAPI.XtreamSeries[];
          }
          XtreamAPI.getSeries(credentials).then(fresh => {
            if (fresh.length > 0) SeriesCache.set(sourceId, fresh);
          }).catch(() => {});
          return cached.data as XtreamAPI.XtreamSeries[];
        }
      }
      return XtreamAPI.getSeries(credentials);
    },
    enabled: !!credentials,
    staleTime: THREE_DAYS,
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
      {/* === QUICK STATS === */}
      <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-hide">
        <Link to="/live" className="flex shrink-0 items-center gap-2 rounded-xl bg-red-600/15 px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/25">
          <Radio className="h-4 w-4" />
          <span>{stats.channels} kanaler</span>
        </Link>
        <Link to="/movies" className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600/15 px-4 py-3 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-600/25">
          <Film className="h-4 w-4" />
          <span>{stats.movies} filmer</span>
        </Link>
        <Link to="/series" className="flex shrink-0 items-center gap-2 rounded-xl bg-purple-600/15 px-4 py-3 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-600/25">
          <Clapperboard className="h-4 w-4" />
          <span>{stats.series} serier</span>
        </Link>
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

      {/* === TRENDING MOVIES (Perplexity) === */}
      {trending?.movies && trending.movies.length > 0 && (
        <ContentCarousel title="🔥 Trending filmer just nu">
          {trending.movies.map((movie, i) => (
            <div key={i} className="shrink-0 w-[140px] sm:w-[160px]">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted">
                {movie.poster ? (
                  <img src={movie.poster} alt={movie.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">🎬</div>
                )}
                <div className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </div>
              </div>
              <p className="mt-1.5 truncate text-xs font-medium text-foreground">{movie.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{movie.year} · {movie.description}</p>
            </div>
          ))}
        </ContentCarousel>
      )}

      {/* === TRENDING SERIES (Perplexity) === */}
      {trending?.series && trending.series.length > 0 && (
        <ContentCarousel title="🔥 Trending serier just nu">
          {trending.series.map((s, i) => (
            <div key={i} className="shrink-0 w-[140px] sm:w-[160px]">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted">
                {s.poster ? (
                  <img src={s.poster} alt={s.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">📺</div>
                )}
                <div className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </div>
              </div>
              <p className="mt-1.5 truncate text-xs font-medium text-foreground">{s.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{s.year} · {s.description}</p>
            </div>
          ))}
        </ContentCarousel>
      )}

      {/* === LIVE TV === */}
      {featuredChannels.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600">
                <Tv className="h-4 w-4 text-white" />
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
                  <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-white" />LIVE
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
