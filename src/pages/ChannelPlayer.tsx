import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStream } from '@/contexts/StreamContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { PlayerManager } from '@/components/player/PlayerManager';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import * as XtreamAPI from '@/lib/xtream-api';

export default function ChannelPlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeSource, credentials, preferTsLive, useProxy, forceHttpLive } = useStream();
  const { updateHistory } = useWatchHistory(activeSource?.id);

  // Fetch channel info
  const { data: channels, isLoading } = useQuery({
    queryKey: ['live-channels', credentials?.serverUrl],
    queryFn: async () => {
      if (!credentials) return [];
      return XtreamAPI.getLiveStreams(credentials);
    },
    enabled: !!credentials,
    staleTime: 5 * 60 * 1000,
  });

  const channel = channels?.find(c => String(c.stream_id) === id);

  const getStreamUrl = () => {
    if (!credentials || !id) return '';
    return XtreamAPI.buildLiveStreamUrl(credentials, parseInt(id), { 
      preferTs: preferTsLive,
      useProxy,
      forceHttp: forceHttpLive,
    });
  };

  const getOriginalStreamUrl = () => {
    if (!credentials || !id) return '';
    return XtreamAPI.buildLiveStreamUrl(credentials, parseInt(id), { useProxy: false });
  };

  const handleClose = () => {
    navigate('/live');
  };

  const handleProgress = (currentTime: number, duration: number) => {
    if (!activeSource || !channel) return;
    
    updateHistory.mutate({
      stream_source_id: activeSource.id,
      item_type: 'channel',
      item_id: String(channel.stream_id),
      item_name: channel.name,
      item_poster: channel.stream_icon || null,
      series_id: null,
      season_num: null,
      episode_num: null,
      position_seconds: Math.floor(currentTime),
      duration_seconds: duration > 0 ? Math.floor(duration) : null,
    });
  };

  if (!credentials) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">{t('common.noSource')}</p>
          <Button onClick={() => navigate('/settings/sources')} className="mt-4">
            {t('browse.addSource')}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="aspect-video w-full max-w-4xl" />
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('common.notFound')}</p>
        <Button onClick={() => navigate('/live')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <PlayerManager
        src={getStreamUrl()}
        originalStreamUrl={getOriginalStreamUrl()}
        title={channel.name}
        poster={channel.stream_icon}
        onClose={handleClose}
        onProgress={handleProgress}
        autoPlay
      />
    </div>
  );
}
