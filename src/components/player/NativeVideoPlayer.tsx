import { useEffect, useCallback, useRef, useState } from 'react';
import { useNativePlatform } from '@/hooks/useNativePlatform';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
const LOADING_TIMEOUT_MS = 15000; // 15 seconds timeout

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
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInitializedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  }, [onClose, navigate]);

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

      // Set a timeout so user isn't stuck forever
      timeoutRef.current = setTimeout(() => {
        if (isInitializedRef.current) return; // already loaded
        console.warn('[NativeVideoPlayer] Loading timed out after', LOADING_TIMEOUT_MS, 'ms');
        setError('Uppspelningen tog för lång tid. Kontrollera din internetanslutning eller prova en annan kanal.');
        setIsLoading(false);
      }, LOADING_TIMEOUT_MS);

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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
      {/* Always show a close/back button */}
      <Button
        size="icon"
        variant="ghost"
        className="absolute left-4 top-4 z-[60] text-white hover:bg-white/20"
        onClick={handleClose}
      >
        <ArrowLeft className="h-6 w-6" />
      </Button>

      {isLoading && (
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="text-lg">Startar uppspelning...</p>
          {title && <p className="text-sm text-muted-foreground">{title}</p>}
          <p className="mt-4 text-xs text-muted-foreground">
            Tryck på pilen för att gå tillbaka
          </p>
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center gap-4 text-white">
          <p className="text-lg text-destructive">Kunde inte spela upp</p>
          <p className="max-w-xs text-center text-sm text-muted-foreground">{error}</p>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => { setError(null); setIsLoading(true); initPlayer(); }} variant="default">
              Försök igen
            </Button>
            <Button onClick={handleClose} variant="outline" className="text-white border-white/30">
              Gå tillbaka
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
