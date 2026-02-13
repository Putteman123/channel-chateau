import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { ContentCard } from '@/components/content/ContentCard';
import { CategoryFilter } from '@/components/content/CategoryFilter';
import { SearchBar } from '@/components/content/SearchBar';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { LoadError } from '@/components/content/LoadError';
import * as XtreamAPI from '@/lib/xtream-api';

export default function Movies() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSource, credentials } = useStream();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  const { getProgress } = useWatchHistory(activeSource?.id);
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
  const { data: movies, isLoading, error, refetch, isRefetching } = useQuery({
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
      ) : error ? (
        <LoadError onRetry={() => refetch()} isRetrying={isRefetching} error={error} />
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
              onPlay={() => navigate(`/movie/${movie.stream_id}`)}
              onToggleFavorite={() => handleToggleFavorite(movie)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
