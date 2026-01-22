import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { ContentCard } from '@/components/content/ContentCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart } from 'lucide-react';

export default function Favorites() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSource } = useStream();
  const { favorites, removeFavorite } = useFavorites(activeSource?.id);

  const channels = favorites.filter((f) => f.item_type === 'channel');
  const movies = favorites.filter((f) => f.item_type === 'movie');
  const series = favorites.filter((f) => f.item_type === 'series');

  const handleRemoveFavorite = (fav: typeof favorites[0]) => {
    if (!activeSource) return;
    removeFavorite.mutate({
      streamSourceId: activeSource.id,
      itemType: fav.item_type,
      itemId: fav.item_id,
    });
  };

  if (favorites.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <Heart className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="mt-4 text-xl font-semibold">{t('favorites.noFavorites')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('favorites.noFavoritesDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('favorites.title')}</h1>
        <p className="text-muted-foreground">
          {t('favorites.itemsSaved', { count: favorites.length })}
        </p>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">{t('common.all')} ({favorites.length})</TabsTrigger>
          <TabsTrigger value="channels">{t('favorites.channels')} ({channels.length})</TabsTrigger>
          <TabsTrigger value="movies">{t('favorites.movies')} ({movies.length})</TabsTrigger>
          <TabsTrigger value="series">{t('favorites.series')} ({series.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {favorites.map((fav) => (
              <ContentCard
                key={fav.id}
                id={fav.item_id}
                title={fav.item_name || t('common.unknown')}
                poster={fav.item_poster || undefined}
                type={fav.item_type}
                isFavorite={true}
                onPlay={() => {
                  if (fav.item_type === 'series') {
                    navigate(`/series/${fav.item_id}`);
                  }
                }}
                onToggleFavorite={() => handleRemoveFavorite(fav)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="channels" className="mt-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {channels.map((fav) => (
              <ContentCard
                key={fav.id}
                id={fav.item_id}
                title={fav.item_name || t('common.unknown')}
                poster={fav.item_poster || undefined}
                type="channel"
                isFavorite={true}
                onToggleFavorite={() => handleRemoveFavorite(fav)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="movies" className="mt-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {movies.map((fav) => (
              <ContentCard
                key={fav.id}
                id={fav.item_id}
                title={fav.item_name || t('common.unknown')}
                poster={fav.item_poster || undefined}
                type="movie"
                isFavorite={true}
                onToggleFavorite={() => handleRemoveFavorite(fav)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="series" className="mt-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {series.map((fav) => (
              <ContentCard
                key={fav.id}
                id={fav.item_id}
                title={fav.item_name || t('common.unknown')}
                poster={fav.item_poster || undefined}
                type="series"
                isFavorite={true}
                onPlay={() => navigate(`/series/${fav.item_id}`)}
                onToggleFavorite={() => handleRemoveFavorite(fav)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
