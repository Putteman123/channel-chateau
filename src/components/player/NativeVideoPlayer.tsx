import { useEffect, useCallback, useRef, useState } from 'react';
import { VideoPlayer } from '@capgo/capacitor-video-player';
import { useNativePlatform } from '@/hooks/useNativePlatform';
import { Loader2 } from 'lucide-react';

export interface NativeVideoPlayerProps {
  /** Stream URL (raw HTTP URL - no proxy needed for native) */
  src: string;
  /** Video title */
  title?: string;
  /** Poster image URL */
  poster?: string;
  /** Called when player is closed */
  onClose?: () => void;
  /** Called on playback progress */
  onProgress?: (currentTime: number, duration: number) => void;
  /** Called when video ends */
  onEnded?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** Auto-play on load */
  autoPlay?: boolean;
  /** Start position in seconds */
  startPosition?: number;
}

const PLAYER_ID = 'native-iptv-player';

/**
 * NativeVideoPlayer - Uses native ExoPlayer (Android) / AVPlayer (iOS)
 * via @capgo/capacitor-video-player plugin for direct IPTV stream playback.
 * 
 * This player bypasses browser restrictions (Mixed Content, CORS, codec limits)
 * by using the platform's native video engine.
 */
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

  // Initialize native player
  const initPlayer = useCallback(async () => {
    if (!isNative) {
      console.warn('[NativeVideoPlayer] Not on native platform, cannot init');
      return;
    }

    if (isInitializedRef.current) {
      console.log('[NativeVideoPlayer] Already initialized, stopping first');
      try {
        await VideoPlayer.stopAllPlayers();
      } catch {
        // Ignore stop errors
      }
    }

    try {
      console.log('[NativeVideoPlayer] Initializing player with URL:', src.substring(0, 80) + '...');
      setIsLoading(true);
      setError(null);

      await VideoPlayer.initPlayer({
        mode: 'fullscreen',
        url: src,
        playerId: PLAYER_ID,
        componentTag: 'div',
        title: title || 'Video',
        smallTitle: title || '',
        displayMode: 'landscape',
        pipEnabled: platform === 'android', // PiP on Android
        bkmodeEnabled: false,
        showControls: true,
        chromecast: false,
        exitOnEnd: true,
      });

      isInitializedRef.current = true;
      console.log('[NativeVideoPlayer] Player initialized successfully');

      // Seek to start position if provided
      if (startPosition > 0) {
        console.log('[NativeVideoPlayer] Seeking to position:', startPosition);
        await VideoPlayer.setCurrentTime({
          playerId: PLAYER_ID,
          seektime: startPosition,
        });
      }

      // Auto-play
      if (autoPlay) {
        await VideoPlayer.play({ playerId: PLAYER_ID });
        console.log('[NativeVideoPlayer] Playback started');
      }

      setIsLoading(false);

      // Set up progress polling (native player handles events internally)
      if (onProgress) {
        progressIntervalRef.current = setInterval(async () => {
          try {
            const currentTime = await VideoPlayer.getCurrentTime({ playerId: PLAYER_ID });
            const duration = await VideoPlayer.getDuration({ playerId: PLAYER_ID });
            if (currentTime.value !== undefined && duration.value !== undefined) {
              onProgress(currentTime.value, duration.value);
              
              // Check if video ended (duration - currentTime < 1 second)
              if (duration.value > 0 && duration.value - currentTime.value < 1) {
                console.log('[NativeVideoPlayer] Video ended (detected via polling)');
                onEnded?.();
              }
            }
          } catch {
            // Player might be closed - trigger onClose
            console.log('[NativeVideoPlayer] Player closed (detected via polling error)');
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            onClose?.();
          }
        }, 5000); // Every 5 seconds
      }
    } catch (err) {
      console.error('[NativeVideoPlayer] Init error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize player';
      setError(errorMessage);
      setIsLoading(false);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [src, title, isNative, platform, autoPlay, startPosition, onProgress, onEnded, onClose, onError]);

  // Initialize player on mount
  useEffect(() => {
    if (!isNative) return;

    // Initialize player
    initPlayer();

    // Cleanup
    return () => {
      console.log('[NativeVideoPlayer] Cleanup');
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      // Stop player
      VideoPlayer.stopAllPlayers().catch(() => {
        // Ignore cleanup errors
      });

      isInitializedRef.current = false;
    };
  }, [isNative, initPlayer]);

  // Re-initialize when src changes
  useEffect(() => {
    if (isNative && isInitializedRef.current) {
      console.log('[NativeVideoPlayer] Source changed, reinitializing');
      initPlayer();
    }
  }, [src, isNative, initPlayer]);

  // If not on native platform, return null (fallback handled by PlayerManager)
  if (!isNative) {
    console.warn('[NativeVideoPlayer] Not on native platform');
    return null;
  }

  // Show loading state while native player initializes
  // The native player takes over the screen in fullscreen mode
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
          <button
            onClick={onClose}
            className="mt-4 rounded-lg bg-primary px-6 py-2 text-primary-foreground"
          >
            Stäng
          </button>
        </div>
      )}
    </div>
  );
}
