import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { ContentCard } from '@/components/content/ContentCard';
import { CategoryFilter } from '@/components/content/CategoryFilter';
import { SearchBar } from '@/components/content/SearchBar';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import * as XtreamAPI from '@/lib/xtream-api';

export default function LiveTV() {
  const { activeSource, credentials } = useStream();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<XtreamAPI.XtreamChannel | null>(null);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['live-categories', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getLiveCategories(credentials);
    },
    enabled: !!credentials,
  });

  // Fetch channels
  const { data: channels, isLoading } = useQuery({
    queryKey: ['live-channels', credentials?.serverUrl, selectedCategory],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getLiveStreams(credentials, selectedCategory || undefined);
    },
    enabled: !!credentials,
  });

  // Filter channels by search
  const filteredChannels = useMemo(() => {
    if (!channels) return [];
    if (!searchQuery) return channels;
    
    const query = searchQuery.toLowerCase();
    return channels.filter((channel) =>
      channel.name.toLowerCase().includes(query)
    );
  }, [channels, searchQuery]);

  const handleToggleFavorite = (channel: XtreamAPI.XtreamChannel) => {
    if (!activeSource) return;
    
    const itemId = String(channel.stream_id);
    if (isFavorite(activeSource.id, 'channel', itemId)) {
      removeFavorite.mutate({ streamSourceId: activeSource.id, itemType: 'channel', itemId });
    } else {
      addFavorite.mutate({
        stream_source_id: activeSource.id,
        item_type: 'channel',
        item_id: itemId,
        item_name: channel.name,
        item_poster: channel.stream_icon || null,
      });
    }
  };

  const getStreamUrl = (channel: XtreamAPI.XtreamChannel) => {
    if (!credentials) return '';
    return XtreamAPI.buildLiveStreamUrl(credentials, channel.stream_id);
  };

  if (!credentials) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Ingen streamkälla vald</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Live TV</h1>
        <p className="text-muted-foreground">
          {channels?.length || 0} kanaler tillgängliga
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Sök kanaler..."
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
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredChannels.map((channel) => (
            <ContentCard
              key={channel.stream_id}
              id={String(channel.stream_id)}
              title={channel.name}
              poster={channel.stream_icon}
              type="channel"
              isFavorite={isFavorite(activeSource!.id, 'channel', String(channel.stream_id))}
              onPlay={() => setSelectedChannel(channel)}
              onToggleFavorite={() => handleToggleFavorite(channel)}
            />
          ))}
        </div>
      )}

      {/* Video Player Dialog */}
      <Dialog open={!!selectedChannel} onOpenChange={() => setSelectedChannel(null)}>
        <DialogContent className="max-w-4xl p-0">
          {selectedChannel && (
            <VideoPlayer
              src={getStreamUrl(selectedChannel)}
              title={selectedChannel.name}
              poster={selectedChannel.stream_icon}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
