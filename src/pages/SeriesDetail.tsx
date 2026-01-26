import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Play, Heart, Star, Calendar, Clock } from 'lucide-react';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useTMDBMetadata } from '@/hooks/useTMDBMetadata';
import { ShakaPlayer } from '@/components/player/ShakaPlayer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { cn } from '@/lib/utils';
import * as XtreamAPI from '@/lib/xtream-api';

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const { activeSource, credentials, preferTsVod, useProxy } = useStream();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  const { updateHistory, getProgress } = useWatchHistory(activeSource?.id);
  
  const [selectedEpisode, setSelectedEpisode] = useState<{
    id: string;
    title: string;
    season: number;
    episode: number;
    extension: string;
  } | null>(null);

  // Fetch series info
  const { data: seriesInfo, isLoading } = useQuery({
    queryKey: ['series-info', credentials?.serverUrl, id],
    queryFn: async () => {
      if (!credentials || !id) return null;
      return XtreamAPI.getSeriesInfo(credentials, parseInt(id));
    },
    enabled: !!credentials && !!id,
  });

  // Fetch TMDB metadata for enhanced backdrop and description
  // MUST be called before any early returns to follow React's rules of hooks
  const { data: tmdbData } = useTMDBMetadata({
    title: seriesInfo?.info?.name || '',
    type: 'tv',
    enabled: !!seriesInfo?.info?.name,
  });

  const handleToggleFavorite = () => {
    if (!activeSource || !seriesInfo || !id) return;
    
    if (isFavorite(activeSource.id, 'series', id)) {
      removeFavorite.mutate({ streamSourceId: activeSource.id, itemType: 'series', itemId: id });
    } else {
      addFavorite.mutate({
        stream_source_id: activeSource.id,
        item_type: 'series',
        item_id: id,
        item_name: seriesInfo.info.name,
        item_poster: seriesInfo.info.cover || null,
      });
    }
  };

  const getStreamUrl = (episodeId: string, extension: string) => {
    if (!credentials) return '';
    return XtreamAPI.buildSeriesStreamUrl(credentials, episodeId, { 
      extension, 
      preferTs: preferTsVod,
      useProxy 
    });
  };

  const getOriginalStreamUrl = (episodeId: string, extension: string) => {
    if (!credentials) return '';
    // Get the direct URL without proxy for external players
    return XtreamAPI.buildSeriesStreamUrl(credentials, episodeId, { 
      extension, 
      useProxy: false 
    });
  };

  const handleProgress = (currentTime: number, duration: number) => {
    if (!activeSource || !selectedEpisode || !id) return;
    
    updateHistory.mutate({
      stream_source_id: activeSource.id,
      item_type: 'episode',
      item_id: selectedEpisode.id,
      item_name: selectedEpisode.title,
      item_poster: seriesInfo?.info.cover || null,
      series_id: id,
      season_num: selectedEpisode.season,
      episode_num: selectedEpisode.episode,
      position_seconds: Math.floor(currentTime),
      duration_seconds: Math.floor(duration),
    });
  };

  if (!credentials) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Ingen streamkälla vald</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!seriesInfo) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Kunde inte hitta serien</p>
      </div>
    );
  }

  const { info, seasons, episodes } = seriesInfo;
  const seasonNumbers = Object.keys(episodes).sort((a, b) => parseInt(a) - parseInt(b));
  const isFav = id ? isFavorite(activeSource!.id, 'series', id) : false;

  // Use TMDB data as fallback
  const displayBackdrop = tmdbData?.backdrop || info.backdrop_path?.[0];
  const displayPlot = info.plot || tmdbData?.description;
  const displayRating = info.rating || (tmdbData?.rating ? String(tmdbData.rating) : undefined);

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative -mx-6 -mt-6 h-[50vh] overflow-hidden">
        {displayBackdrop && (
          <img
            src={displayBackdrop}
            alt={info.name}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex gap-6">
            {/* Poster */}
            {info.cover && (
              <img
                src={info.cover}
                alt={info.name}
                className="hidden h-48 w-32 rounded-lg object-cover shadow-2xl md:block"
              />
            )}
            
            {/* Info */}
            <div className="flex-1 space-y-4">
              <h1 className="text-4xl font-bold">{info.name}</h1>
              
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {displayRating && parseFloat(displayRating) > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                    {parseFloat(displayRating).toFixed(1)}
                  </span>
                )}
                {info.releaseDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {info.releaseDate}
                  </span>
                )}
                {info.episode_run_time && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {info.episode_run_time} min
                  </span>
                )}
                {info.genre && <span>{info.genre}</span>}
              </div>

              {displayPlot && (
                <p className="line-clamp-3 max-w-2xl text-muted-foreground">
                  {displayPlot}
                </p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleToggleFavorite}
                  className={cn(isFav && 'bg-primary/20')}
                >
                  <Heart className={cn('mr-2 h-4 w-4', isFav && 'fill-primary text-primary')} />
                  {isFav ? 'I favoriter' : 'Lägg till favorit'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Seasons & Episodes */}
      <Tabs defaultValue={seasonNumbers[0]} className="w-full">
        <TabsList className="mb-4">
          {seasonNumbers.map((season) => (
            <TabsTrigger key={season} value={season}>
              Säsong {season}
            </TabsTrigger>
          ))}
        </TabsList>

        {seasonNumbers.map((season) => (
          <TabsContent key={season} value={season}>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {episodes[season]?.map((episode) => {
                  const progress = getProgress(activeSource!.id, 'episode', episode.id);
                  
                  return (
                    <div
                      key={episode.id}
                      className="group flex cursor-pointer gap-4 rounded-lg bg-card p-4 transition-colors hover:bg-card/80"
                      onClick={() => setSelectedEpisode({
                        id: episode.id,
                        title: episode.title,
                        season: episode.season,
                        episode: episode.episode_num,
                        extension: episode.container_extension,
                      })}
                    >
                      {/* Episode thumbnail */}
                      <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded bg-muted">
                        {episode.info?.movie_image ? (
                          <img
                            src={episode.info.movie_image}
                            alt={episode.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <span className="text-2xl">🎬</span>
                          </div>
                        )}
                        
                        {/* Play overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                          <Play className="h-8 w-8 text-white" />
                        </div>

                        {/* Progress bar */}
                        {progress > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Episode info */}
                      <div className="flex-1 space-y-1">
                        <h3 className="font-medium">
                          {episode.episode_num}. {episode.title}
                        </h3>
                        {episode.info?.plot && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {episode.info.plot}
                          </p>
                        )}
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {episode.info?.duration && (
                            <span>{episode.info.duration}</span>
                          )}
                          {episode.info?.releasedate && (
                            <span>{episode.info.releasedate}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>

      {/* Video Player Dialog */}
      <Dialog open={!!selectedEpisode} onOpenChange={() => setSelectedEpisode(null)}>
        <DialogContent className="max-w-4xl p-0" aria-describedby={undefined}>
          <VisuallyHidden>
            <DialogTitle>
              {selectedEpisode ? `S${selectedEpisode.season}E${selectedEpisode.episode}: ${selectedEpisode.title}` : 'Video Player'}
            </DialogTitle>
          </VisuallyHidden>
          {selectedEpisode && (
            <ShakaPlayer
              src={getStreamUrl(selectedEpisode.id, selectedEpisode.extension)}
              originalStreamUrl={getOriginalStreamUrl(selectedEpisode.id, selectedEpisode.extension)}
              title={`S${selectedEpisode.season}E${selectedEpisode.episode}: ${selectedEpisode.title}`}
              poster={info.cover}
              onProgress={handleProgress}
              onClose={() => setSelectedEpisode(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
