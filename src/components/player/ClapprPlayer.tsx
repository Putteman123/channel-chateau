import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { X, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useSpatialNavigation } from '@/contexts/SpatialNavigationContext';
import {
  isProxiedUrl,
  extractOriginalUrl as extractOriginalFromProxy,
  buildExternalPlayerUrl,
} from '@/lib/stream-utils';

export interface ClapprPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onClose?: () => void;
  startPosition?: number;
  autoPlay?: boolean;
  originalStreamUrl?: string;
  onError?: (error: Error) => void;
}

interface PlayerError {
  type: 'network' | 'decode' | 'unknown';
  message: string;
  details?: string;
}

export function ClapprPlayer({
  src,
  title,
  onProgress,
  onEnded,
  onClose,
  startPosition = 0,
  autoPlay = true,
  originalStreamUrl,
  onError,
}: ClapprPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const [showControls, setShowControls] = useState(true);
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { isTvMode } = useSpatialNavigation();

  // Get URL for external players
  const externalUrl = useMemo(() => {
    if (originalStreamUrl) return originalStreamUrl;
    if (isProxiedUrl(src)) {
      const extracted = extractOriginalFromProxy(src);
      if (extracted) return extracted;
    }
    return src;
  }, [src, originalStreamUrl]);

  // Handle opening in external player
  const handleOpenExternal = useCallback((playerType: 'vlc' | 'mpv' | 'iina' | 'copy') => {
    if (playerType === 'copy') {
      navigator.clipboard.writeText(externalUrl);
    } else {
      const url = buildExternalPlayerUrl(externalUrl, playerType);
      window.open(url, '_blank');
    }
  }, [externalUrl]);

  // Track component mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize Clappr player
  useEffect(() => {
    if (!containerRef.current || !src) return;

    const initPlayer = async () => {
      try {
        setIsLoading(true);
        setPlayerError(null);

        // Dynamically import Clappr to avoid SSR issues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ClapprModule = await import('@clappr/core') as any;
        const Clappr = ClapprModule.default || ClapprModule;

        if (!isMountedRef.current || !containerRef.current) return;

        // Destroy existing player if any
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }

        console.log('[ClapprPlayer] Initializing with source:', src);

        // Create new player instance (use any for flexibility with Clappr config)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const playerConfig: any = {
          source: src,
          parent: containerRef.current,
          autoPlay: autoPlay,
          playback: {
            hlsjsConfig: {
              enableWorker: true,
              lowLatencyMode: true,
              backBufferLength: 90,
            },
          },
        };
        
        const player = new Clappr.Player(playerConfig);
        
        // Set up event listeners after creation
        player.on('ready', () => {
          console.log('[ClapprPlayer] Player ready');
          setIsLoading(false);
          
          // Seek to start position
          if (startPosition > 0) {
            player.seek(startPosition);
          }
        });
        
        player.on('play', () => {
          console.log('[ClapprPlayer] Playback started');
          setIsLoading(false);
          setPlayerError(null);
        });
        
        player.on('pause', () => {
          console.log('[ClapprPlayer] Playback paused');
        });
        
        player.on('ended', () => {
          console.log('[ClapprPlayer] Playback ended');
          onEnded?.();
        });
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        player.on('error', (error: any) => {
          console.error('[ClapprPlayer] Error:', error);
          setIsLoading(false);
          
          const playerErr: PlayerError = {
            type: 'network',
            message: 'Kunde inte spela strömmen',
            details: error?.message || 'Okänt fel. Prova öppna i VLC.',
          };
          
          setPlayerError(playerErr);
          onError?.(new Error(error?.message || 'Playback error'));
        });

        playerRef.current = player;

      } catch (error) {
        console.error('[ClapprPlayer] Failed to initialize:', error);
        setIsLoading(false);
        
        const err = error instanceof Error ? error : new Error('Unknown error');
        setPlayerError({
          type: 'unknown',
          message: 'Kunde inte ladda spelaren',
          details: err.message,
        });
        onError?.(err);
      }
    };

    initPlayer();

    // Cleanup
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.warn('[ClapprPlayer] Error during cleanup:', e);
        }
        playerRef.current = null;
      }
    };
  }, [src, autoPlay, startPosition, onEnded, onError]);

  // Progress tracking
  useEffect(() => {
    if (!onProgress) return;

    progressIntervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (player) {
        try {
          const currentTime = player.getCurrentTime?.() || 0;
          const duration = player.getDuration?.() || 0;
          if (duration > 0) {
            onProgress(currentTime, duration);
          }
        } catch {
          // Ignore errors during progress tracking
        }
      }
    }, 5000);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [onProgress]);

  // TV mode keyboard handling
  useEffect(() => {
    if (!isTvMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const player = playerRef.current;
      if (!player) return;

      switch (e.key) {
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          onClose?.();
          break;
        case ' ':
          e.preventDefault();
          if (player.isPlaying?.()) {
            player.pause();
          } else {
            player.play();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.seek((player.getCurrentTime?.() || 0) - 10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.seek((player.getCurrentTime?.() || 0) + 10);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isTvMode, onClose]);

  return (
    <div className="relative h-full w-full bg-black">
      {/* Player Container */}
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        onMouseMove={() => setShowControls(true)}
      />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {/* Custom Top Bar */}
      <div
        className={cn(
          'absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </Button>
            {title && (
              <h2 className="text-lg font-semibold text-white">{title}</h2>
            )}
          </div>

          {/* External Player Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-white hover:bg-white/20"
              >
                <ExternalLink className="h-4 w-4" />
                Öppna externt
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem onClick={() => handleOpenExternal('vlc')}>
                Öppna i VLC
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenExternal('mpv')}>
                Öppna i MPV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenExternal('iina')}>
                Öppna i IINA (macOS)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenExternal('copy')}>
                Kopiera direktlänk
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Error Display */}
      {playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
          <Alert variant="destructive" className="max-w-lg">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{playerError.message}</AlertTitle>
            <AlertDescription className="mt-2">
              {playerError.details}
            </AlertDescription>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenExternal('vlc')}
              >
                Öppna i VLC
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenExternal('copy')}
              >
                Kopiera länk
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Stäng
              </Button>
            </div>
          </Alert>
        </div>
      )}
    </div>
  );
}
