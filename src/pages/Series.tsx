import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { ContentCard } from '@/components/content/ContentCard';
import { CategoryFilter } from '@/components/content/CategoryFilter';
import { SearchBar } from '@/components/content/SearchBar';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { LoadError } from '@/components/content/LoadError';
import * as XtreamAPI from '@/lib/xtream-api';

export default function Series() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSource, credentials } = useStream();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['series-categories', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getSeriesCategories(credentials);
    },
    enabled: !!credentials,
  });

  // Fetch series
  const { data: series, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['series', credentials?.serverUrl, selectedCategory],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getSeries(credentials, selectedCategory || undefined);
    },
    enabled: !!credentials,
  });

  // Filter series by search
  const filteredSeries = useMemo(() => {
    if (!series) return [];
    if (!searchQuery) return series;
    
    const query = searchQuery.toLowerCase();
    return series.filter((s) =>
      s.name.toLowerCase().includes(query)
    );
  }, [series, searchQuery]);

  const handleToggleFavorite = (s: XtreamAPI.XtreamSeries) => {
    if (!activeSource) return;
    
    const itemId = String(s.series_id);
    if (isFavorite(activeSource.id, 'series', itemId)) {
      removeFavorite.mutate({ streamSourceId: activeSource.id, itemType: 'series', itemId });
    } else {
      addFavorite.mutate({
        stream_source_id: activeSource.id,
        item_type: 'series',
        item_id: itemId,
        item_name: s.name,
        item_poster: s.cover || null,
      });
    }
  };

  if (!credentials) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">{t('series.noSource')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('series.title')}</h1>
        <p className="text-muted-foreground">
          {t('series.seriesAvailable', { count: series?.length || 0 })}
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('series.searchSeries')}
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
          {filteredSeries.map((s) => (
            <ContentCard
              key={s.series_id}
              id={String(s.series_id)}
              title={s.name}
              poster={s.cover}
              type="series"
              rating={s.rating_5based}
              isFavorite={isFavorite(activeSource!.id, 'series', String(s.series_id))}
              onPlay={() => navigate(`/series/${s.series_id}`)}
              onToggleFavorite={() => handleToggleFavorite(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
