import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Play, Star, Clock, Calendar, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useFavorites } from '@/hooks/useFavorites';
import { useTMDBDetailedMetadata } from '@/hooks/useTMDBMetadata';
import { LazyImage } from '@/components/content/LazyImage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import * as XtreamAPI from '@/lib/xtream-api';

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeSource, credentials, preferTsVod, useProxy } = useStream();
  const { getProgress } = useWatchHistory(activeSource?.id);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);

  const { data: movies, isLoading } = useQuery({
    queryKey: ['movies', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getVodStreams(credentials);
    },
    enabled: !!credentials,
    staleTime: 5 * 60 * 1000,
  });

  const movie = movies?.find(m => String(m.stream_id) === id);

  const { data: tmdb, isLoading: tmdbLoading } = useTMDBDetailedMetadata({
    title: movie?.name || '',
    type: 'movie',
    enabled: !!movie?.name,
  });

  const progress = movie ? getProgress(activeSource?.id || '', 'movie', String(movie.stream_id)) : 0;
  const isFav = movie ? isFavorite(activeSource?.id || '', 'movie', String(movie.stream_id)) : false;

  const handlePlay = () => {
    if (movie) navigate(`/movie/${movie.stream_id}/play`);
  };

  const handleToggleFavorite = () => {
    if (!activeSource || !movie) return;
    const itemId = String(movie.stream_id);
    if (isFav) {
      removeFavorite.mutate({ streamSourceId: activeSource.id, itemType: 'movie', itemId });
    } else {
      addFavorite.mutate({
        stream_source_id: activeSource.id,
        item_type: 'movie',
        item_id: itemId,
        item_name: movie.name,
        item_poster: movie.stream_icon || null,
      });
    }
  };

  const backdrop = tmdb?.backdrop || movie?.stream_icon;
  const poster = tmdb?.poster || movie?.stream_icon;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[50vh] w-full rounded-xl" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Filmen hittades inte</p>
        <Button onClick={() => navigate('/movies')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Section */}
      <section className="relative -mx-6 -mt-4 overflow-hidden">
        {/* Backdrop */}
        <div className="relative h-[55vh] min-h-[400px] max-h-[650px]">
          {backdrop ? (
            <img
              src={backdrop}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-muted via-background to-muted" />
          )}
          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
        </div>

        {/* Content over hero */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-8 lg:px-12">
          <div className="flex items-end gap-6">
            {/* Poster */}
            <div className="hidden shrink-0 sm:block">
              <div className="w-[160px] overflow-hidden rounded-lg shadow-2xl lg:w-[200px]">
                <LazyImage
                  src={poster}
                  alt={movie.name}
                  aspectRatio="poster"
                />
              </div>
            </div>

            {/* Info */}
            <div className="max-w-2xl space-y-3">
              {tmdb?.tagline && (
                <p className="text-sm italic text-foreground/60">{tmdb.tagline}</p>
              )}
              <h1 className="text-3xl font-bold leading-tight text-foreground drop-shadow-lg md:text-4xl lg:text-5xl">
                {movie.name}
              </h1>

              {/* Meta badges */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/80">
                {tmdb?.rating && tmdb.rating > 0 && (
                  <span className="flex items-center gap-1 font-semibold">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {tmdb.rating.toFixed(1)}
                  </span>
                )}
                {tmdb?.year && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {tmdb.year}
                  </span>
                )}
                {tmdb?.runtime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {Math.floor(tmdb.runtime / 60)}h {tmdb.runtime % 60}min
                  </span>
                )}
                {tmdb?.genres?.map(g => (
                  <span key={g} className="rounded-full bg-muted/60 px-2.5 py-0.5 text-xs backdrop-blur-sm">
                    {g}
                  </span>
                ))}
              </div>

              {/* Progress */}
              {progress > 0 && (
                <div className="w-48">
                  <div className="h-1 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{progress}% sett</p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <Button size="lg" onClick={handlePlay} className="gap-2">
                  <Play className="h-5 w-5 fill-current" />
                  {progress > 0 ? 'Fortsätt titta' : 'Spela'}
                </Button>
                {tmdb?.trailerKey && (
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => window.open(`https://www.youtube.com/watch?v=${tmdb.trailerKey}`, '_blank')}
                    className="gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Trailer
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleToggleFavorite}
                  className={cn(isFav && 'border-primary text-primary')}
                >
                  {isFav ? '❤️ Favorit' : '🤍 Lägg till'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Back button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/movies')}
          className="absolute left-4 top-4 bg-black/40 text-white backdrop-blur-sm hover:bg-black/60"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </section>

      {/* Description */}
      {tmdb?.description && (
        <section className="px-2">
          <h2 className="mb-2 text-lg font-semibold">Handling</h2>
          <p className="max-w-3xl leading-relaxed text-muted-foreground">{tmdb.description}</p>
        </section>
      )}

      {/* Cast */}
      {tmdb?.cast && tmdb.cast.length > 0 && (
        <section className="px-2">
          <h2 className="mb-4 text-lg font-semibold">Skådespelare</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {tmdb.cast.map((actor) => (
              <div key={actor.name} className="flex shrink-0 flex-col items-center gap-2 w-[90px]">
                <div className="h-[90px] w-[90px] overflow-hidden rounded-full bg-muted">
                  {actor.profile ? (
                    <img src={actor.profile} alt={actor.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground">
                      {actor.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="line-clamp-1 text-xs font-medium">{actor.name}</p>
                  <p className="line-clamp-1 text-[10px] text-muted-foreground">{actor.character}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
