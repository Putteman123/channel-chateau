import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useOrientation } from '@/hooks/useOrientation';
import { ChannelCard } from '@/components/epg/ChannelCard';
import { EPGDrawer } from '@/components/epg/EPGDrawer';
import { CategoryFilter } from '@/components/content/CategoryFilter';
import { SearchBar } from '@/components/content/SearchBar';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { LoadError } from '@/components/content/LoadError';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import * as XtreamAPI from '@/lib/xtream-api';

export default function LiveTV() {
  const { t } = useTranslation();
  const { activeSource, credentials } = useStream();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  const { isLandscapeMobile } = useOrientation();
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<XtreamAPI.XtreamChannel | null>(null);
  const [playingChannel, setPlayingChannel] = useState<XtreamAPI.XtreamChannel | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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
  const { data: channels, isLoading, error, refetch, isRefetching } = useQuery({
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

  const handlePlayChannel = (channel: XtreamAPI.XtreamChannel) => {
    setPlayingChannel(channel);
    setSelectedChannel(null);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Live TV</h1>
          <p className="text-muted-foreground">
            {channels?.length || 0} kanaler tillgängliga
          </p>
        </div>

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && setViewMode(value as 'grid' | 'list')}
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
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
        <ContentSkeleton type="channel" count={12} />
      ) : error ? (
        <LoadError onRetry={() => refetch()} isRetrying={isRefetching} />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredChannels.map((channel) => (
            <ChannelCard
              key={channel.stream_id}
              channel={channel}
              credentials={credentials}
              isFavorite={isFavorite(activeSource!.id, 'channel', String(channel.stream_id))}
              onPlay={() => handlePlayChannel(channel)}
              onToggleFavorite={() => handleToggleFavorite(channel)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredChannels.map((channel) => (
            <div
              key={channel.stream_id}
              className="flex cursor-pointer items-center gap-4 rounded-lg bg-card p-3 transition-colors hover:bg-card/80"
              onClick={() => setSelectedChannel(channel)}
            >
              {/* Channel logo */}
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                {channel.stream_icon ? (
                  <img
                    src={channel.stream_icon}
                    alt={channel.name}
                    className="h-full w-full object-contain p-1"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl">
                    📺
                  </div>
                )}
              </div>

              {/* Channel name */}
              <div className="flex-1">
                <h3 className="font-medium">{channel.name}</h3>
              </div>

              {/* Live badge */}
              <span className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                LIVE
              </span>

              {/* Play button */}
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayChannel(channel);
                }}
              >
                Titta
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* EPG Drawer for channel details */}
      <EPGDrawer
        open={!!selectedChannel}
        onOpenChange={() => setSelectedChannel(null)}
        channel={selectedChannel}
        credentials={credentials}
        onPlay={() => selectedChannel && handlePlayChannel(selectedChannel)}
      />

      {/* Video Player - Fullscreen in landscape mobile, Dialog otherwise */}
      {isLandscapeMobile && playingChannel ? (
        <div className="fixed inset-0 z-50 bg-black">
          <VideoPlayer
            src={getStreamUrl(playingChannel)}
            title={playingChannel.name}
            poster={playingChannel.stream_icon}
            onClose={() => setPlayingChannel(null)}
          />
        </div>
      ) : (
        <Dialog open={!!playingChannel} onOpenChange={() => setPlayingChannel(null)}>
          <DialogContent className="max-w-5xl p-0">
            {playingChannel && (
              <VideoPlayer
                src={getStreamUrl(playingChannel)}
                title={playingChannel.name}
                poster={playingChannel.stream_icon}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
