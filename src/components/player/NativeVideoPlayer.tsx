import { useEffect, useCallback, useRef, useState } from 'react';
import { useNativePlatform } from '@/hooks/useNativePlatform';
import { Loader2 } from 'lucide-react';

export interface NativeVideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
  onClose?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  autoPlay?: boolean;
  startPosition?: number;
}

const PLAYER_ID = 'native-iptv-player';

// Lazy-load the video player plugin to avoid triggerEvent crash on startup
let VideoPlayerModule: typeof import('@capgo/capacitor-video-player') | null = null;

async function getVideoPlayer() {
  if (!VideoPlayerModule) {
    VideoPlayerModule = await import('@capgo/capacitor-video-player');
  }
  return VideoPlayerModule.VideoPlayer;
}

export function NativeVideoPlayer({
  src,
  title,
  poster,
  onClose,
  onProgress,
  onEnded,
  onError,
  autoPlay = true,
  startPosition = 0,
}: NativeVideoPlayerProps) {
  const { isNative, platform } = useNativePlatform();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInitializedRef = useRef(false);

  const initPlayer = useCallback(async () => {
    if (!isNative) {
      console.warn('[NativeVideoPlayer] Not on native platform, cannot init');
      return;
    }

    const VP = await getVideoPlayer();

    if (isInitializedRef.current) {
      console.log('[NativeVideoPlayer] Already initialized, stopping first');
      try { await VP.stopAllPlayers(); } catch { /* ignore */ }
    }

    try {
      console.log('[NativeVideoPlayer] Initializing player with URL:', src.substring(0, 80) + '...');
      setIsLoading(true);
      setError(null);

      await VP.initPlayer({
        mode: 'fullscreen',
        url: src,
        playerId: PLAYER_ID,
        componentTag: 'div',
        title: title || 'Video',
        smallTitle: title || '',
        displayMode: 'landscape',
        pipEnabled: platform === 'android',
        bkmodeEnabled: false,
        showControls: true,
        chromecast: false,
        exitOnEnd: true,
      });

      isInitializedRef.current = true;
      console.log('[NativeVideoPlayer] Player initialized successfully');

      if (startPosition > 0) {
        await VP.setCurrentTime({ playerId: PLAYER_ID, seektime: startPosition });
      }

      if (autoPlay) {
        await VP.play({ playerId: PLAYER_ID });
      }

      setIsLoading(false);

      if (onProgress) {
        progressIntervalRef.current = setInterval(async () => {
          try {
            const currentTime = await VP.getCurrentTime({ playerId: PLAYER_ID });
            const duration = await VP.getDuration({ playerId: PLAYER_ID });
            if (currentTime.value !== undefined && duration.value !== undefined) {
              onProgress(currentTime.value, duration.value);
              if (duration.value > 0 && duration.value - currentTime.value < 1) {
                onEnded?.();
              }
            }
          } catch {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            onClose?.();
          }
        }, 5000);
      }
    } catch (err) {
      console.error('[NativeVideoPlayer] Init error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize player';
      setError(errorMessage);
      setIsLoading(false);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [src, title, isNative, platform, autoPlay, startPosition, onProgress, onEnded, onClose, onError]);

  useEffect(() => {
    if (!isNative) return;
    initPlayer();

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      getVideoPlayer().then(VP => VP.stopAllPlayers()).catch(() => {});
      isInitializedRef.current = false;
    };
  }, [isNative, initPlayer]);

  useEffect(() => {
    if (isNative && isInitializedRef.current) {
      initPlayer();
    }
  }, [src, isNative, initPlayer]);

  if (!isNative) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {isLoading && (
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="text-lg">Startar uppspelning...</p>
          {title && <p className="text-sm text-muted-foreground">{title}</p>}
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center gap-4 text-white">
          <p className="text-lg text-destructive">Kunde inte spela upp</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={onClose} className="mt-4 rounded-lg bg-primary px-6 py-2 text-primary-foreground">
            Stäng
          </button>
        </div>
      )}
    </div>
  );
}
