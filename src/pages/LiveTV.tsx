import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import { useStream } from '@/contexts/StreamContext';
import { useFavorites } from '@/hooks/useFavorites';
import { useOrientation } from '@/hooks/useOrientation';
import { useM3UData } from '@/hooks/useM3UData';
import { ChannelCard } from '@/components/epg/ChannelCard';
import { EPGDrawer } from '@/components/epg/EPGDrawer';
import { CategoryFilter } from '@/components/content/CategoryFilter';
import { SearchBar } from '@/components/content/SearchBar';
import { ContentSkeleton } from '@/components/content/ContentSkeleton';
import { LoadError } from '@/components/content/LoadError';
import { VirtualizedGrid } from '@/components/content/VirtualizedGrid';
import { ShakaPlayer, StreamHttpHeaders } from '@/components/player/ShakaPlayer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import * as XtreamAPI from '@/lib/xtream-api';
import { M3UChannel } from '@/lib/m3u-parser';
import { getImageProxyUrl } from '@/lib/stream-utils';

// Unified channel type for both Xtream and M3U
type UnifiedChannel = XtreamAPI.XtreamChannel | M3UChannel;

export default function LiveTV() {
  const { t } = useTranslation();
  const { activeSource, sourceType, credentials, m3uUrl, preferTsLive, forceHttpLive, useProxy, customEpgUrl } = useStream();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(activeSource?.id);
  const { isLandscapeMobile } = useOrientation();
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<XtreamAPI.XtreamChannel | null>(null);
  const [playingChannel, setPlayingChannel] = useState<UnifiedChannel | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // M3U data hook - always call but conditionally enable
  const m3uData = useM3UData({ 
    m3uUrl, 
    enabled: sourceType === 'm3u' && !!m3uUrl 
  });

  // Fetch Xtream categories
  const { data: xtreamCategories } = useQuery({
    queryKey: ['live-categories', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getLiveCategories(credentials);
    },
    enabled: sourceType === 'xtream' && !!credentials,
  });

  // Fetch Xtream channels
  const { 
    data: xtreamChannels, 
    isLoading: xtreamLoading, 
    error: xtreamError, 
    refetch: refetchXtream, 
    isRefetching: isRefetchingXtream 
  } = useQuery({
    queryKey: ['live-channels', credentials?.serverUrl, selectedCategory],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getLiveStreams(credentials, selectedCategory || undefined);
    },
    enabled: sourceType === 'xtream' && !!credentials,
  });

  // Unified data based on source type
  const categories = useMemo(() => {
    if (sourceType === 'm3u') {
      return m3uData.getLiveCategories().map(c => ({ id: c.category_id, name: c.category_name }));
    }
    return xtreamCategories?.map(c => ({ id: c.category_id, name: c.category_name })) || [];
  }, [sourceType, m3uData, xtreamCategories]);

  const channels = useMemo(() => {
    if (sourceType === 'm3u') {
      return m3uData.getLiveChannels(selectedCategory || undefined);
    }
    return xtreamChannels || [];
  }, [sourceType, m3uData, xtreamChannels, selectedCategory]);

  const isLoading = sourceType === 'm3u' ? m3uData.isLoading : xtreamLoading;
  const error = sourceType === 'm3u' ? m3uData.error : xtreamError;
  const refetch = sourceType === 'm3u' ? m3uData.refetch : refetchXtream;
  const isRefetching = sourceType === 'm3u' ? m3uData.isLoading : isRefetchingXtream;

  // Filter channels by search
  const filteredChannels = useMemo(() => {
    if (!channels) return [];
    if (!searchQuery) return channels;
    
    const query = searchQuery.toLowerCase();
    return channels.filter((channel) =>
      channel.name.toLowerCase().includes(query)
    );
  }, [channels, searchQuery]);

  const handleToggleFavorite = (channel: UnifiedChannel) => {
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

  const getStreamUrl = useCallback((channel: UnifiedChannel) => {
    // For M3U channels, use the stream_url directly (through proxy)
    if ('stream_url' in channel && channel.stream_url) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      // Base proxy URL - headers will be added separately by VideoPlayer
      return `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(channel.stream_url)}`;
    }
    // For Xtream channels
    if (!credentials) return '';
    return XtreamAPI.buildLiveStreamUrl(credentials, channel.stream_id, { 
      preferTs: preferTsLive,
      useProxy,
      forceHttp: forceHttpLive,
    });
  }, [credentials, preferTsLive, forceHttpLive, useProxy]);

  // Extract HTTP headers from M3U channel for VideoPlayer
  const getHttpHeaders = useCallback((channel: UnifiedChannel) => {
    if ('http' in channel && channel.http) {
      const headers: { userAgent?: string; referer?: string } = {};
      if (channel.http['user-agent']) headers.userAgent = channel.http['user-agent'];
      if (channel.http.referrer) headers.referer = channel.http.referrer;
      return Object.keys(headers).length > 0 ? headers : undefined;
    }
    return undefined;
  }, []);

  const getOriginalStreamUrl = useCallback((channel: UnifiedChannel) => {
    // For M3U channels, return the direct URL
    if ('stream_url' in channel && channel.stream_url) {
      return channel.stream_url;
    }
    // For Xtream channels
    if (!credentials) return '';
    return XtreamAPI.buildLiveStreamUrl(credentials, channel.stream_id, { useProxy: false });
  }, [credentials]);

  const handlePlayChannel = (channel: UnifiedChannel) => {
    setPlayingChannel(channel);
    setSelectedChannel(null);
  };

  // Check if we have a valid source
  const hasValidSource = (sourceType === 'xtream' && credentials) || (sourceType === 'm3u' && m3uUrl);

  if (!hasValidSource) {
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
            {sourceType === 'm3u' && <span className="ml-2 text-xs">(M3U)</span>}
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
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      )}

      {isLoading ? (
        <ContentSkeleton type="channel" count={12} />
      ) : error ? (
        <LoadError onRetry={() => refetch()} isRetrying={isRefetching} error={error} />
      ) : viewMode === 'grid' ? (
        <VirtualizedGrid
          items={filteredChannels}
          keyExtractor={(channel) => channel.stream_id}
          emptyMessage="Inga kanaler hittades"
          renderItem={(channel) => (
            <ChannelCard
              channel={channel as XtreamAPI.XtreamChannel}
              credentials={credentials}
              isFavorite={isFavorite(activeSource!.id, 'channel', String(channel.stream_id))}
              onPlay={() => handlePlayChannel(channel)}
              onToggleFavorite={() => handleToggleFavorite(channel)}
            />
          )}
        />
      ) : (
        <Virtuoso
          useWindowScroll
          totalCount={filteredChannels.length}
          overscan={200}
          itemContent={(index) => {
            const channel = filteredChannels[index];
            if (!channel) return null;
            
            return (
              <div
                className="mb-2 flex cursor-pointer items-center gap-4 rounded-lg bg-card p-3 transition-colors hover:bg-card/80"
                onClick={() => setSelectedChannel(channel as XtreamAPI.XtreamChannel)}
              >
                {/* Channel logo */}
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                  {channel.stream_icon ? (
                    <img
                      src={getImageProxyUrl(channel.stream_icon)}
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
            );
          }}
        />
      )}

      {/* EPG Drawer for channel details (Xtream only) */}
      {sourceType === 'xtream' && credentials && (
        <EPGDrawer
          open={!!selectedChannel}
          onOpenChange={() => setSelectedChannel(null)}
          channel={selectedChannel}
          credentials={credentials}
          customEpgUrl={customEpgUrl}
          onPlay={() => selectedChannel && handlePlayChannel(selectedChannel)}
        />
      )}

      {/* Video Player - Fullscreen in landscape mobile, Dialog otherwise */}
      {isLandscapeMobile && playingChannel ? (
        <div className="fixed inset-0 z-50 bg-black">
          <ShakaPlayer
            src={getStreamUrl(playingChannel)}
            originalStreamUrl={getOriginalStreamUrl(playingChannel)}
            title={playingChannel.name}
            poster={playingChannel.stream_icon}
            httpHeaders={getHttpHeaders(playingChannel)}
            onClose={() => setPlayingChannel(null)}
          />
        </div>
      ) : (
        <Dialog open={!!playingChannel} onOpenChange={() => setPlayingChannel(null)}>
          <DialogContent className="max-w-5xl p-0">
            {playingChannel && (
              <ShakaPlayer
                src={getStreamUrl(playingChannel)}
                originalStreamUrl={getOriginalStreamUrl(playingChannel)}
                title={playingChannel.name}
                poster={playingChannel.stream_icon}
                httpHeaders={getHttpHeaders(playingChannel)}
                onClose={() => setPlayingChannel(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
