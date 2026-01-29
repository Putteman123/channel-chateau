import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EPGInfo } from './EPGInfo';
import { getImageProxyUrl } from '@/lib/stream-utils';
import * as XtreamAPI from '@/lib/xtream-api';

interface EPGDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: XtreamAPI.XtreamChannel | null;
  credentials: XtreamAPI.XtreamCredentials | null;
  customEpgUrl?: string | null;
  onPlay: () => void;
}

export function EPGDrawer({
  open,
  onOpenChange,
  channel,
  credentials,
  customEpgUrl,
  onPlay,
}: EPGDrawerProps) {
  if (!channel || !credentials) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            {channel.stream_icon && (
              <img
                src={getImageProxyUrl(channel.stream_icon)}
                alt={channel.name}
                className="h-10 w-10 rounded object-contain"
              />
            )}
            <span className="line-clamp-1">{channel.name}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Play button */}
          <Button className="w-full" size="lg" onClick={onPlay}>
            Titta nu
          </Button>

          {/* EPG Info */}
          <EPGInfo
            credentials={credentials}
            streamId={channel.stream_id}
            channelName={channel.name}
            epgChannelId={channel.epg_channel_id}
            customEpgUrl={customEpgUrl}
            compact={false}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
