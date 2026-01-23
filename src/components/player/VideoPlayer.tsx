import { useEffect, useRef, useCallback, useState } from 'react';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import { X, Play, Pause, SkipBack, SkipForward, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpatialNavigation } from '@/contexts/SpatialNavigationContext';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onClose?: () => void;
  startPosition?: number;
  autoPlay?: boolean;
}

// Diagnostik för spelarfel
interface PlayerError {
  type: 'mixed-content' | 'cors' | 'network' | 'decode' | 'unknown';
  message: string;
  details?: string;
}

function diagnoseError(src: string, errorCode?: number, errorMessage?: string): PlayerError {
  const isHttpSource = src.startsWith('http://');
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  
  // Check for provider blocking (HTTP 458 or similar)
  if (errorMessage?.includes('458') || errorMessage?.includes('blocked')) {
    return {
      type: 'network',
      message: 'Leverantören blockerar uppspelning',
      details: 'Din IPTV-leverantör tillåter eventuellt inte uppspelning via proxy. Kontakta din leverantör eller prova igen senare.',
    };
  }
  
  // Mixed Content detection
  if (isHttpSource && isHttpsPage) {
    return {
      type: 'mixed-content',
      message: 'Strömmen blockeras av Mixed Content-skydd',
      details: 'HTTPS-sidan kan inte ladda HTTP-strömmar. Aktivera "Osäkert innehåll" i webbläsarinställningarna för denna sida, eller använd stream-proxyn.',
    };
  }
  
  // Video.js error codes
  if (errorCode === 2) {
    return {
      type: 'network',
      message: 'Nätverksfel vid laddning av ström',
      details: errorMessage || 'Kontrollera din anslutning och att streamkällan är tillgänglig.',
    };
  }
  
  if (errorCode === 3) {
    return {
      type: 'decode',
      message: 'Kunde inte avkoda strömmen',
      details: 'Formatet stöds inte av webbläsaren.',
    };
  }
  
  if (errorCode === 4) {
    return {
      type: 'network',
      message: 'Strömmen kunde inte hittas eller är otillgänglig',
      details: errorMessage || 'URL:en kan vara felaktig eller strömmen har gått offline.',
    };
  }
  
  return {
    type: 'unknown',
    message: 'Ett okänt fel uppstod',
    details: errorMessage || 'Försök igen eller kontrollera konsolen för mer information.',
  };
}

export function VideoPlayer({
  src,
  poster,
  title,
  onProgress,
  onEnded,
  onClose,
  startPosition = 0,
  autoPlay = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);
  
  const { isTvMode } = useSpatialNavigation();

  // Log stream URL for debugging
  useEffect(() => {
    if (src) {
      console.log('[VideoPlayer] Stream URL:', src);
      console.log('[VideoPlayer] Protocol check - Page:', window.location.protocol, 'Stream:', src.startsWith('https') ? 'https' : 'http');
      
      // Pre-flight check for Mixed Content
      if (src.startsWith('http://') && window.location.protocol === 'https:') {
        console.warn('[VideoPlayer] ⚠️ Mixed Content Warning: Attempting to load HTTP stream on HTTPS page');
      }
    }
  }, [src]);

  // Determine source type
  const getSourceType = useCallback((url: string) => {
    if (url.includes('.m3u8')) return 'application/x-mpegURL';
    if (url.includes('.mp4')) return 'video/mp4';
    if (url.includes('.webm')) return 'video/webm';
    return 'application/x-mpegURL'; // Default to HLS
  }, []);

  // Show controls temporarily
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying]);

  // Handle TV mode keyboard events
  useEffect(() => {
    if (!isTvMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const player = playerRef.current;
      if (!player) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          showControlsTemporarily();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          player.currentTime((player.currentTime() || 0) - 10);
          showControlsTemporarily();
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          player.currentTime((player.currentTime() || 0) + 10);
          showControlsTemporarily();
          break;
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          if (player.paused()) {
            player.play();
            setIsPlaying(true);
          } else {
            player.pause();
            setIsPlaying(false);
          }
          showControlsTemporarily();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          e.stopPropagation();
          onClose?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isTvMode, onClose, showControlsTemporarily]);

  // Initialize player
  useEffect(() => {
    if (!videoRef.current || !src) return;
    
    // Reset error state when source changes
    setPlayerError(null);

    // Create video element if not exists
    if (!playerRef.current) {
      const videoElement = document.createElement('video-js');
      videoElement.classList.add('vjs-big-play-centered', 'vjs-theme-city');
      videoRef.current.appendChild(videoElement);

      const player = videojs(videoElement, {
        autoplay: autoPlay,
        controls: !isTvMode, // Hide native controls in TV mode
        responsive: true,
        fluid: true,
        playsinline: true,
        poster: poster,
        sources: [{ src, type: getSourceType(src) }],
        html5: {
          vhs: {
            overrideNative: true,
            enableLowInitialPlaylist: true,
          },
        },
      });

      playerRef.current = player;

      // Set start position when ready
      player.on('loadedmetadata', () => {
        if (startPosition > 0) {
          player.currentTime(startPosition);
        }
        setDuration(player.duration() || 0);
        setPlayerError(null); // Clear error on successful load
      });

      // Track play/pause state
      player.on('play', () => {
        setIsPlaying(true);
        setPlayerError(null);
      });
      player.on('pause', () => setIsPlaying(false));

      // Track time updates
      player.on('timeupdate', () => {
        setCurrentTime(player.currentTime() || 0);
      });

      // Handle ended event
      player.on('ended', () => {
        onEnded?.();
      });

      // Error handling with diagnostics
      player.on('error', () => {
        const error = player.error();
        console.error('[VideoPlayer] Player error:', error);
        console.error('[VideoPlayer] Error code:', error?.code, 'Message:', error?.message);
        
        const diagnosis = diagnoseError(src, error?.code, error?.message);
        console.error('[VideoPlayer] Diagnosis:', diagnosis);
        setPlayerError(diagnosis);
      });

      // VHS/HLS specific error handling
      player.tech(true)?.on?.('retryplaylist', () => {
        console.warn('[VideoPlayer] HLS: Retrying playlist...');
      });

    } else {
      // Update source if it changes
      const player = playerRef.current;
      player.src({ src, type: getSourceType(src) });
      if (poster) {
        player.poster(poster);
      }
    }
  }, [src, poster, autoPlay, startPosition, getSourceType, onEnded, isTvMode]);

  // Progress tracking
  useEffect(() => {
    if (onProgress && playerRef.current) {
      progressIntervalRef.current = setInterval(() => {
        const player = playerRef.current;
        if (player) {
          const time = player.currentTime() || 0;
          const dur = player.duration() || 0;
          if (dur > 0) {
            onProgress(time, dur);
          }
        }
      }, 5000); // Report every 5 seconds
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [onProgress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Player control functions
  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    
    if (player.paused()) {
      player.play();
    } else {
      player.pause();
    }
    showControlsTemporarily();
  };

  const seekBackward = () => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime((player.currentTime() || 0) - 10);
    showControlsTemporarily();
  };

  const seekForward = () => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime((player.currentTime() || 0) + 10);
    showControlsTemporarily();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="relative w-full"
      onMouseMove={showControlsTemporarily}
      onMouseEnter={() => setShowControls(true)}
    >
      {/* Title overlay with close button */}
      {(title || onClose) && (
        <div className={cn(
          "absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}>
          <div className="flex items-center justify-between">
            {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <X className="h-6 w-6" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {playerError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 p-4">
          <Alert variant="destructive" className="max-w-md bg-destructive/20 border-destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-white">{playerError.message}</AlertTitle>
            <AlertDescription className="text-white/80">
              {playerError.details}
              {playerError.type === 'mixed-content' && (
                <div className="mt-3 text-xs opacity-70">
                  <strong>Tips:</strong> Klicka på 🔒 i adressfältet → Webbplatsinställningar → Tillåt osäkert innehåll
                </div>
              )}
            </AlertDescription>
            <div className="mt-4 flex gap-2">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => {
                  setPlayerError(null);
                  playerRef.current?.src({ src, type: getSourceType(src) });
                  playerRef.current?.play();
                }}
              >
                Försök igen
              </Button>
              {onClose && (
                <Button size="sm" variant="ghost" onClick={onClose}>
                  Stäng
                </Button>
              )}
            </div>
          </Alert>
        </div>
      )}

      {/* Video.js container */}
      <div 
        data-vjs-player 
        className="aspect-video w-full overflow-hidden rounded-xl shadow-2xl"
        onClick={togglePlay}
      >
        <div ref={videoRef} />
      </div>

      {/* Custom TV Mode Controls */}
      {isTvMode && (
        <div className={cn(
          "absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-white/80">
              <span>{formatTime(currentTime)}</span>
              <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="lg"
              onClick={seekBackward}
              className="player-control focusable text-white hover:bg-white/20 h-14 w-14 rounded-full"
            >
              <SkipBack className="h-6 w-6" />
            </Button>
            
            <Button
              variant="ghost"
              size="lg"
              onClick={togglePlay}
              className="player-control focusable text-white hover:bg-white/20 h-16 w-16 rounded-full bg-white/10"
            >
              {isPlaying ? (
                <Pause className="h-8 w-8" />
              ) : (
                <Play className="h-8 w-8 ml-1" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="lg"
              onClick={seekForward}
              className="player-control focusable text-white hover:bg-white/20 h-14 w-14 rounded-full"
            >
              <SkipForward className="h-6 w-6" />
            </Button>
          </div>

          {/* TV mode hint */}
          <div className="mt-4 text-center text-xs text-white/60">
            ← → Spola • Mellanslag Pausa • Esc Stäng
          </div>
        </div>
      )}
    </div>
  );
}
