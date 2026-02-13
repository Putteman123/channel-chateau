import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Star, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useTMDBMetadata } from '@/hooks/useTMDBMetadata';
import { PlayerManager } from '@/components/player/PlayerManager';
import { SubtitlePicker } from '@/components/player/SubtitlePicker';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import * as XtreamAPI from '@/lib/xtream-api';

export default function MoviePlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeSource, credentials, preferTsVod, useProxy } = useStream();
  const { updateHistory, getProgress } = useWatchHistory(activeSource?.id);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);

  // Fetch movies list to find the current movie
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

  // Fetch TMDB metadata for enhanced info
  const { data: tmdbData } = useTMDBMetadata({
    title: movie?.name || '',
    type: 'movie',
    enabled: !!movie?.name,
  });

  // Calculate start position from watch history
  const progress = movie ? getProgress(activeSource?.id || '', 'movie', String(movie.stream_id)) : 0;

  const getStreamUrl = () => {
    if (!credentials || !id) return '';
    const extension = movie?.container_extension || 'mp4';
    return XtreamAPI.buildMovieStreamUrl(credentials, parseInt(id), { 
      extension, 
      preferTs: preferTsVod,
      useProxy 
    });
  };

  const getOriginalStreamUrl = () => {
    if (!credentials || !id) return '';
    const extension = movie?.container_extension || 'mp4';
    return XtreamAPI.buildMovieStreamUrl(credentials, parseInt(id), { 
      extension, 
      useProxy: false 
    });
  };

  const handleClose = () => {
    navigate(-1);
  };

  const handleProgress = (currentTime: number, duration: number) => {
    if (!activeSource || !movie) return;
    
    updateHistory.mutate({
      stream_source_id: activeSource.id,
      item_type: 'movie',
      item_id: String(movie.stream_id),
      item_name: movie.name,
      item_poster: movie.stream_icon || tmdbData?.poster || null,
      series_id: null,
      season_num: null,
      episode_num: null,
      position_seconds: Math.floor(currentTime),
      duration_seconds: duration > 0 ? Math.floor(duration) : null,
    });
  };

  const handleEnded = () => {
    navigate(-1);
  };

  if (!credentials) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">{t('common.noSource')}</p>
          <Button onClick={() => navigate('/settings/sources')} className="mt-4">
            {t('browse.addSource')}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-black">
        <div className="relative flex-1">
          <Skeleton className="h-full w-full" />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-8">
            <Skeleton className="mb-2 h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">{t('common.notFound')}</p>
        <Button onClick={() => navigate('/movies')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const displayTitle = movie.name;
  const displayPoster = tmdbData?.poster || movie.stream_icon;
  const displayRating = tmdbData?.rating || movie.rating_5based;
  const displayYear = tmdbData?.year;
  const displayDescription = tmdbData?.description;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Video Player */}
      <div className="flex-1">
        <PlayerManager
          src={getStreamUrl()}
          originalStreamUrl={getOriginalStreamUrl()}
          title={displayTitle}
          poster={displayPoster}
          onClose={handleClose}
          onProgress={handleProgress}
          onEnded={handleEnded}
          autoPlay
        />
      </div>

      {/* Subtitle picker button - top right */}
      <div className="absolute right-14 top-4 z-50">
        <SubtitlePicker
          movieTitle={displayTitle}
          tmdbId={tmdbData?.tmdbId}
          onSubtitleLoad={(url) => setSubtitleUrl(url)}
          onSubtitleClear={() => setSubtitleUrl(null)}
        />
      </div>

      {/* Movie Info Overlay */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-6 opacity-0 transition-opacity hover:opacity-100">
        <div className="max-w-2xl">
          <h1 className="mb-2 text-2xl font-bold text-white">{displayTitle}</h1>
          
          <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-white/80">
            {displayRating && Number(displayRating) > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                {Number(displayRating).toFixed(1)}
              </span>
            )}
            {displayYear && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {displayYear}
              </span>
            )}
          </div>

          {displayDescription && (
            <p className="line-clamp-3 text-sm text-white/70">{displayDescription}</p>
          )}
        </div>
      </div>
    </div>
  );
}
