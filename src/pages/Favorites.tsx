import { useNavigate } from 'react-router-dom';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { ContentCard } from '@/components/content/ContentCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart } from 'lucide-react';

export default function Favorites() {
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
        <h2 className="mt-4 text-xl font-semibold">Inga favoriter ännu</h2>
        <p className="mt-2 text-muted-foreground">
          Lägg till kanaler, filmer och serier i dina favoriter för snabb åtkomst.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mina favoriter</h1>
        <p className="text-muted-foreground">
          {favorites.length} objekt sparade
        </p>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Alla ({favorites.length})</TabsTrigger>
          <TabsTrigger value="channels">Kanaler ({channels.length})</TabsTrigger>
          <TabsTrigger value="movies">Filmer ({movies.length})</TabsTrigger>
          <TabsTrigger value="series">Serier ({series.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {favorites.map((fav) => (
              <ContentCard
                key={fav.id}
                id={fav.item_id}
                title={fav.item_name || 'Okänd'}
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
                title={fav.item_name || 'Okänd'}
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
                title={fav.item_name || 'Okänd'}
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
                title={fav.item_name || 'Okänd'}
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
