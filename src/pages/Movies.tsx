import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useOrientation } from '@/hooks/useOrientation';
import { ContentCard } from '@/components/content/ContentCard';
import { CategoryFilter } from '@/components/content/CategoryFilter';
import { SearchBar } from '@/components/content/SearchBar';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import * as XtreamAPI from '@/lib/xtream-api';

export default function Movies() {
  const { t } = useTranslation();
  const { activeSource, credentials } = useStream();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  const { updateHistory, getProgress } = useWatchHistory(activeSource?.id);
  const { isLandscapeMobile } = useOrientation();
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<XtreamAPI.XtreamMovie | null>(null);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['vod-categories', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getVodCategories(credentials);
    },
    enabled: !!credentials,
  });

  // Fetch movies
  const { data: movies, isLoading } = useQuery({
    queryKey: ['movies', credentials?.serverUrl, selectedCategory],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getVodStreams(credentials, selectedCategory || undefined);
    },
    enabled: !!credentials,
  });

  // Filter movies by search
  const filteredMovies = useMemo(() => {
    if (!movies) return [];
    if (!searchQuery) return movies;
    
    const query = searchQuery.toLowerCase();
    return movies.filter((movie) =>
      movie.name.toLowerCase().includes(query)
    );
  }, [movies, searchQuery]);

  const handleToggleFavorite = (movie: XtreamAPI.XtreamMovie) => {
    if (!activeSource) return;
    
    const itemId = String(movie.stream_id);
    if (isFavorite(activeSource.id, 'movie', itemId)) {
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

  if (!credentials) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">{t('movies.noSource')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('movies.title')}</h1>
        <p className="text-muted-foreground">
          {t('movies.moviesAvailable', { count: movies?.length || 0 })}
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('movies.searchMovies')}
          />
        </div>
      </div>

      {categories && categories.length > 0 && (
        <CategoryFilter
          categories={categories.map((c) => ({ id: c.category_id, name: c.category_name }))}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      )}

      {isLoading ? (
        <ContentSkeleton count={12} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredMovies.map((movie) => (
            <ContentCard
              key={movie.stream_id}
              id={String(movie.stream_id)}
              title={movie.name}
              poster={movie.stream_icon}
              type="movie"
              rating={movie.rating_5based}
              progress={getProgress(activeSource!.id, 'movie', String(movie.stream_id))}
              isFavorite={isFavorite(activeSource!.id, 'movie', String(movie.stream_id))}
              onPlay={() => setSelectedMovie(movie)}
              onToggleFavorite={() => handleToggleFavorite(movie)}
            />
          ))}
        </div>
      )}

      {/* Video Player - Fullscreen in landscape mobile, Dialog otherwise */}
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
