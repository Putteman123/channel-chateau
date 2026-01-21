import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStream } from '@/contexts/StreamContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useFavorites } from '@/hooks/useFavorites';
import { ContentCard } from '@/components/content/ContentCard';
import { ContentRow } from '@/components/content/ContentRow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as XtreamAPI from '@/lib/xtream-api';

export default function Browse() {
  const { activeSource, credentials, sources } = useStream();
  const { continueWatching, getProgress } = useWatchHistory(activeSource?.id);
  const { favorites, isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);

  // Fetch live channels
  const { data: liveChannels, isLoading: loadingChannels } = useQuery({
    queryKey: ['live-channels', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getLiveStreams(credentials);
    },
    enabled: !!credentials,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch movies
  const { data: movies, isLoading: loadingMovies } = useQuery({
    queryKey: ['movies', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getVodStreams(credentials);
    },
    enabled: !!credentials,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch series
  const { data: series, isLoading: loadingSeries } = useQuery({
    queryKey: ['series', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getSeries(credentials);
    },
    enabled: !!credentials,
    staleTime: 5 * 60 * 1000,
  });

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

  // No sources configured
  if (sources.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>Välkommen till Streamify!</CardTitle>
            <CardDescription>
              Lägg till en streamkälla för att börja titta på Live TV, filmer och serier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/settings/sources">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Lägg till streamkälla
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = loadingChannels || loadingMovies || loadingSeries;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Laddar innehåll...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <ContentRow title="Fortsätt titta">
          {continueWatching.slice(0, 10).map((item) => (
            <div key={item.id} className="w-[150px] shrink-0">
              <ContentCard
                id={item.item_id}
                title={item.item_name || 'Okänd'}
                poster={item.item_poster || undefined}
                type={item.item_type === 'episode' ? 'series' : item.item_type as 'channel' | 'movie' | 'series'}
                progress={getProgress(item.stream_source_id, item.item_type, item.item_id)}
              />
            </div>
          ))}
        </ContentRow>
      )}

      {/* Favorites */}
      {favorites.length > 0 && (
        <ContentRow title="Mina favoriter">
          {favorites.slice(0, 10).map((fav) => (
            <div key={fav.id} className="w-[150px] shrink-0">
              <ContentCard
                id={fav.item_id}
                title={fav.item_name || 'Okänd'}
                poster={fav.item_poster || undefined}
                type={fav.item_type}
                isFavorite={true}
                onToggleFavorite={() => handleToggleFavorite(fav.item_type, fav.item_id, fav.item_name || '', fav.item_poster || undefined)}
              />
            </div>
          ))}
        </ContentRow>
      )}

      {/* Live TV */}
      {liveChannels && liveChannels.length > 0 && (
        <ContentRow title="Live TV" viewAllLink="/live">
          {liveChannels.slice(0, 15).map((channel) => (
            <div key={channel.stream_id} className="w-[150px] shrink-0">
              <ContentCard
                id={String(channel.stream_id)}
                title={channel.name}
                poster={channel.stream_icon}
                type="channel"
                isFavorite={isFavorite(activeSource!.id, 'channel', String(channel.stream_id))}
                onToggleFavorite={() => handleToggleFavorite('channel', String(channel.stream_id), channel.name, channel.stream_icon)}
              />
            </div>
          ))}
        </ContentRow>
      )}

      {/* Movies */}
      {movies && movies.length > 0 && (
        <ContentRow title="Populära filmer" viewAllLink="/movies">
          {movies.slice(0, 15).map((movie) => (
            <div key={movie.stream_id} className="w-[150px] shrink-0">
              <ContentCard
                id={String(movie.stream_id)}
                title={movie.name}
                poster={movie.stream_icon}
                type="movie"
                rating={movie.rating_5based}
                isFavorite={isFavorite(activeSource!.id, 'movie', String(movie.stream_id))}
                onToggleFavorite={() => handleToggleFavorite('movie', String(movie.stream_id), movie.name, movie.stream_icon)}
              />
            </div>
          ))}
        </ContentRow>
      )}

      {/* Series */}
      {series && series.length > 0 && (
        <ContentRow title="Populära serier" viewAllLink="/series">
          {series.slice(0, 15).map((s) => (
            <div key={s.series_id} className="w-[150px] shrink-0">
              <ContentCard
                id={String(s.series_id)}
                title={s.name}
                poster={s.cover}
                type="series"
                rating={s.rating_5based}
                isFavorite={isFavorite(activeSource!.id, 'series', String(s.series_id))}
                onToggleFavorite={() => handleToggleFavorite('series', String(s.series_id), s.name, s.cover)}
              />
            </div>
          ))}
        </ContentRow>
      )}
    </div>
  );
}
