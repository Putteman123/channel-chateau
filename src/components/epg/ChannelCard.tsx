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
  customEpgUrl?: string | null;
}

export function ChannelCard({
  channel,
  credentials,
  isFavorite,
  onPlay,
  onToggleFavorite,
  customEpgUrl,
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
        "group relative overflow-hidden rounded-lg bg-card transition-all duration-300 cursor-pointer",
        "hover:ring-2 hover:ring-primary hover:shadow-lg hover:shadow-primary/20",
        "hover:scale-[1.02]",
        isTvMode && "focusable",
        isTvMode && isFocused && "is-focused"
      )}
    >
      {/* Channel header with logo - Picon style */}
      <div className="relative aspect-video bg-gradient-to-br from-muted to-muted/50">
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

        {/* Live badge with pulsing indicator */}
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white shadow-lg">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          LIVE
        </div>

        {/* Favorite button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute right-2 top-2 h-8 w-8 rounded-full bg-black/60 text-white backdrop-blur-sm transition-all hover:bg-black/80",
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
            "absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 transition-opacity duration-300",
            isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg transition-transform group-hover:scale-110">
            <Play className="h-5 w-5 fill-primary-foreground text-primary-foreground" />
          </div>
        </div>
      </div>

      {/* Channel info with EPG */}
      <div className="p-3">
        <h3 className="mb-2 line-clamp-1 font-medium text-foreground">{channel.name}</h3>
        <EPGInfo
          credentials={credentials}
          streamId={channel.stream_id}
          customEpgUrl={customEpgUrl}
          compact={true}
        />
      </div>
    </div>
  );
}
