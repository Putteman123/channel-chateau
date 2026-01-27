import { Heart, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EPGInfo } from './EPGInfo';
import { cn } from '@/lib/utils';
import { getImageProxyUrl } from '@/lib/stream-utils';
import * as XtreamAPI from '@/lib/xtream-api';
import { useFocusable } from '@/hooks/useFocusable';

interface ChannelCardProps {
  channel: XtreamAPI.XtreamChannel;
  credentials: XtreamAPI.XtreamCredentials;
  isFavorite: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
}

export function ChannelCard({
  channel,
  credentials,
  isFavorite,
  onPlay,
  onToggleFavorite,
}: ChannelCardProps) {
  // Spatial navigation support
  const { ref, isFocused, isTvMode } = useFocusable<HTMLDivElement>({
    group: 'channels',
  });

  return (
    <div 
      ref={ref}
      onClick={onPlay}
      className={cn(
        "group relative overflow-hidden rounded-lg bg-card transition-all cursor-pointer",
        "hover:ring-2 hover:ring-primary",
        isTvMode && "focusable",
        isTvMode && isFocused && "is-focused"
      )}
    >
      {/* Channel header with logo */}
      <div className="relative aspect-video bg-muted">
        {channel.stream_icon ? (
          <img
            src={getImageProxyUrl(channel.stream_icon)}
            alt={channel.name}
            className="h-full w-full object-contain p-4"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-4xl">📺</span>
          </div>
        )}

        {/* Live badge */}
        <div className="absolute left-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
          LIVE
        </div>

        {/* Favorite button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute right-2 top-2 bg-black/50 text-white transition-opacity hover:bg-black/70",
            isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          <Heart className={cn('h-4 w-4', isFavorite && 'fill-primary text-primary')} />
        </Button>

        {/* Play overlay */}
        <div
          className={cn(
            "absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40 transition-opacity",
            isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <Button size="lg" className="h-14 w-14 rounded-full">
            <Play className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* Channel info with EPG */}
      <div className="p-3">
        <h3 className="mb-2 line-clamp-1 font-medium">{channel.name}</h3>
        <EPGInfo
          credentials={credentials}
          streamId={channel.stream_id}
          compact={true}
        />
      </div>
    </div>
  );
}
