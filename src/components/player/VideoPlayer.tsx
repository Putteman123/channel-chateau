import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import { X, Play, Pause, SkipBack, SkipForward, AlertTriangle, Bug, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpatialNavigation } from '@/contexts/SpatialNavigationContext';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  buildExternalPlayerUrl,
  isTsStream,
  hasMixedContentIssue,
} from '@/lib/stream-utils';
import { isCloudflareUrl } from '@/lib/cloudflare-rewrite';

/** Custom HTTP headers for stream requests (from M3U #EXTVLCOPT) */
export interface StreamHttpHeaders {
  userAgent?: string;
  referer?: string;
}

/**
 * Check if URL should use native HTML5 video instead of Video.js
 * MP4/MKV files often contain codecs (like HEVC) that MSE can't decode
 * but native browser video can handle via hardware acceleration
 */
function shouldUseNativePlayer(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.mp4') || pathname.endsWith('.mkv');
  } catch {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('.mp4') || lowerUrl.includes('.mkv');
  }
}

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onClose?: () => void;
  startPosition?: number;
  autoPlay?: boolean;
  /** Original stream URL (before proxy) for external player fallback */
  originalStreamUrl?: string;
  /** Custom HTTP headers from M3U metadata */
  httpHeaders?: StreamHttpHeaders;
  /** Force proxy usage even for HTTPS streams */
  forceProxy?: boolean;
}

// Diagnostik för spelarfel
interface PlayerError {
  type: 'mixed-content' | 'cors' | 'network' | 'decode' | 'ts-format' | 'unknown';
  message: string;
  details?: string;
  httpStatus?: number;
}

// Diagnostics info for debugging
interface DiagnosticsInfo {
  streamUrl: string;
  urlType: string;
  isProxied: boolean;
  protocol: 'http' | 'https';
  pageProtocol: string;
  isTsFormat: boolean;
  lastError?: string;
  lastHttpStatus?: number;
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

// Removed: old extractOriginalFromProxy - now using direct Cloudflare URLs

export function VideoPlayer({
  src,
  poster,
  title,
  onProgress,
  onEnded,
  onClose,
  startPosition = 0,
  autoPlay = true,
  originalStreamUrl,
  httpHeaders,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { isTvMode } = useSpatialNavigation();

  // Determine if we should use native HTML5 video - synkront med useMemo
  const useNativePlayer = useMemo(() => {
    const shouldUseNative = shouldUseNativePlayer(src);
    if (shouldUseNative) {
      console.log('[VideoPlayer] Using native HTML5 video for MP4/MKV format');
    }
    return shouldUseNative;
  }, [src]);

  // Build stream URL with custom headers if provided
  const effectiveSrc = useMemo(() => {
    if (!httpHeaders || (!httpHeaders.userAgent && !httpHeaders.referer)) {
      return src;
    }
    
    // If src is already a proxy URL, append header params
    if (src.includes('/functions/v1/stream-proxy')) {
      const headerParams = [];
      if (httpHeaders.userAgent) headerParams.push(`userAgent=${encodeURIComponent(httpHeaders.userAgent)}`);
      if (httpHeaders.referer) headerParams.push(`referer=${encodeURIComponent(httpHeaders.referer)}`);
      
      if (headerParams.length > 0) {
        const separator = src.includes('?') ? '&' : '?';
        return `${src}${separator}${headerParams.join('&')}`;
      }
    }
    
    return src;
  }, [src, httpHeaders]);

  // Analyze stream URL and set diagnostics
  useEffect(() => {
    if (effectiveSrc) {
      const urlType = effectiveSrc.includes('.m3u8') ? 'HLS (.m3u8)' 
        : effectiveSrc.includes('.ts') ? 'MPEG-TS (.ts)'
        : effectiveSrc.includes('.mp4') ? 'MP4'
        : effectiveSrc.includes('.mkv') ? 'MKV'
        : 'Okänd';
      
      const isProxied = isCloudflareUrl(effectiveSrc);
      const protocol = effectiveSrc.startsWith('https') ? 'https' : 'http';
      const pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'unknown';
      
      // Display URL is the same as effective (no ?url= param to extract)
      const displayUrl = effectiveSrc;
      // Check if it's a TS format stream
      const tsFormat = isTsStream(displayUrl);
      
      setDiagnostics({
        streamUrl: displayUrl,
        urlType,
        isProxied,
        protocol,
        pageProtocol,
        isTsFormat: tsFormat,
      });
      
      console.log('[VideoPlayer] Original URL:', displayUrl);
      console.log('[VideoPlayer] Proxy URL:', effectiveSrc);
      console.log('[VideoPlayer] Protocol check - Page:', pageProtocol, 'Stream:', protocol);
      console.log('[VideoPlayer] Is TS format:', tsFormat, 'Is Proxied:', isProxied);
      if (httpHeaders?.userAgent || httpHeaders?.referer) {
        console.log('[VideoPlayer] Custom HTTP headers:', httpHeaders);
      }
      
      // Pre-flight check for Mixed Content
      if (hasMixedContentIssue(displayUrl) && !isProxied) {
        console.warn('[VideoPlayer] ⚠️ Mixed Content Warning: Attempting to load HTTP stream on HTTPS page without proxy');
      }
      
      // Warning for TS format
      if (tsFormat && !isProxied) {
        console.warn('[VideoPlayer] ⚠️ MPEG-TS format detected. Browser playback may not work - use external player');
      }
    }
  }, [effectiveSrc, httpHeaders]);

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

  // Initialize Video.js player (only for HLS streams, skip for native player)
  useEffect(() => {
    // Skip Video.js initialization for native player
    if (useNativePlayer) {
      setIsLoading(false);
      return;
    }
    
    if (!videoRef.current || !effectiveSrc) return;
    
    // Reset error state when source changes
    setPlayerError(null);
    setIsLoading(true);

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
        sources: [{ src: effectiveSrc, type: getSourceType(effectiveSrc) }],
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
        setIsLoading(false);
      });

      // Track play/pause state
      player.on('play', () => {
        setIsPlaying(true);
        setPlayerError(null);
        setIsLoading(false);
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
        
        // Try to extract HTTP status from error message
        let httpStatus: number | undefined;
        const statusMatch = error?.message?.match(/(\d{3})/);
        if (statusMatch) {
          httpStatus = parseInt(statusMatch[1]);
        }
        
        const diagnosis = diagnoseError(effectiveSrc, error?.code, error?.message);
        console.error('[VideoPlayer] Diagnosis:', diagnosis);
        setPlayerError({ ...diagnosis, httpStatus });
        setIsLoading(false);
        
        // Update diagnostics with error info
        setDiagnostics(prev => prev ? {
          ...prev,
          lastError: error?.message || 'Unknown error',
          lastHttpStatus: httpStatus,
        } : null);
      });

      // VHS/HLS specific error handling
      player.tech(true)?.on?.('retryplaylist', () => {
        console.warn('[VideoPlayer] HLS: Retrying playlist...');
      });

    } else {
      // Update source if it changes
      const player = playerRef.current;
      player.src({ src: effectiveSrc, type: getSourceType(effectiveSrc) });
      if (poster) {
        player.poster(poster);
      }
    }
  }, [effectiveSrc, poster, autoPlay, startPosition, getSourceType, onEnded, isTvMode, useNativePlayer]);

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

  // Handle native video error - fallback to external player
  const handleNativeVideoError = () => {
    console.error('[VideoPlayer] Native video error - codec may not be supported');
    setPlayerError({
      type: 'decode',
      message: 'Filformatet stöds ej av webbläsaren',
      details: 'Videon kan innehålla codecs (t.ex. HEVC/H.265) som din webbläsare inte kan spela upp. Öppna i en extern spelare som VLC.',
    });
    setIsLoading(false);
    setDiagnostics(prev => prev ? {
      ...prev,
      lastError: 'Native video playback failed - unsupported codec',
    } : null);
  };

  // Handle native video loaded - set start position
  const handleNativeVideoLoaded = () => {
    setIsLoading(false);
    if (startPosition > 0 && nativeVideoRef.current) {
      nativeVideoRef.current.currentTime = startPosition;
    }
    setDuration(nativeVideoRef.current?.duration || 0);
  };

  // Handle native video time update
  const handleNativeTimeUpdate = () => {
    if (nativeVideoRef.current) {
      setCurrentTime(nativeVideoRef.current.currentTime);
    }
  };

  // Handle native video play/pause
  const handleNativePlay = () => setIsPlaying(true);
  const handleNativePause = () => setIsPlaying(false);

  // Get external URL for external players
  const externalUrl = useMemo(() => {
    if (originalStreamUrl) return originalStreamUrl;
    // For Cloudflare URLs, the URL is already direct (no ?url= param to extract)
    return effectiveSrc;
  }, [effectiveSrc, originalStreamUrl]);

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

      {/* Error Display with Diagnostics */}
      {playerError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 p-4 overflow-auto">
          <div className="max-w-lg w-full space-y-4">
            {/* Main Error Alert */}
            <Alert variant="destructive" className="bg-destructive/20 border-destructive">
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
            </Alert>

            {/* Provider blocking warning */}
            {(playerError.httpStatus === 502 || playerError.message.includes('blockerar')) && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                <h4 className="font-medium text-yellow-400 mb-2">
                  Din leverantör blockerar streams via proxy
                </h4>
                <p className="text-sm text-yellow-300/80 mb-3">
                  Metadata laddas, men videostreams blockeras från datacenter-IP:er. 
                  Du kan använda en extern spelare istället.
                </p>
                <div className="text-xs text-yellow-300/60 space-y-1">
                  <p>• Stäng av "Använd proxy" i Inställningar → Källor</p>
                  <p>• Öppna streamen i VLC, IPTV Smarters eller liknande</p>
                </div>
              </div>
            )}

            {/* Diagnostic Info Box */}
            <div className="rounded-lg border border-red-500/30 bg-red-950/50 p-4 space-y-3">
              <h4 className="font-medium text-red-300 flex items-center gap-2">
                <Bug className="h-4 w-4" />
                Diagnostikinformation
              </h4>
              
              {/* Error Details */}
              <div className="text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-white/50">Feltyp:</span>
                  <span className="font-mono text-red-300">{playerError.type}</span>
                </div>
                {playerError.httpStatus && (
                  <div className="flex justify-between">
                    <span className="text-white/50">HTTP-status:</span>
                    <span className="font-mono text-red-300">{playerError.httpStatus}</span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-2 mt-2">
                  <span className="text-white/50 block mb-1">Felmeddelande:</span>
                  <code className="text-[10px] text-red-200 bg-black/30 p-1.5 rounded block break-all">
                    {playerError.message}: {playerError.details}
                  </code>
                </div>
              </div>

              {/* Original URL */}
              {diagnostics && (
                <div className="border-t border-white/10 pt-2">
                  <span className="text-white/50 text-xs block mb-1">Original-URL:</span>
                  <code className="text-[10px] text-white/70 bg-black/30 p-1.5 rounded block break-all max-h-16 overflow-auto">
                    {diagnostics.streamUrl}
                  </code>
                </div>
              )}

              {/* Test Link Button */}
              <div className="border-t border-white/10 pt-2 flex flex-wrap gap-2">
                <a
                  href={originalStreamUrl || diagnostics?.streamUrl || src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded text-blue-300 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Testa länk direkt
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto py-1.5 px-3 text-xs"
                  onClick={() => {
                    const url = originalStreamUrl || diagnostics?.streamUrl || src;
                    navigator.clipboard.writeText(url);
                  }}
                >
                  📋 Kopiera URL
                </Button>
              </div>
              
              <p className="text-[10px] text-white/40 italic">
                Om länken fungerar i ny flik men inte här → Mixed Content/CORS-problem. 
                Om den inte fungerar alls → URL:en är död eller blockerad.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 justify-center">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => {
                  setPlayerError(null);
                  playerRef.current?.src({ src: effectiveSrc, type: getSourceType(effectiveSrc) });
                  playerRef.current?.play();
                }}
              >
                Försök igen
              </Button>
              
              {/* External Player Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="default" className="gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Öppna i extern spelare
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = originalStreamUrl || src;
                      window.open(buildExternalPlayerUrl(url, 'vlc'), '_blank');
                    }}
                  >
                    🎬 Öppna i VLC
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = originalStreamUrl || src;
                      window.open(buildExternalPlayerUrl(url, 'mpv'), '_blank');
                    }}
                  >
                    ▶️ Öppna i MPV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = originalStreamUrl || src;
                      window.open(buildExternalPlayerUrl(url, 'iina'), '_blank');
                    }}
                  >
                    🍎 Öppna i IINA (macOS)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = originalStreamUrl || src;
                      navigator.clipboard.writeText(url);
                    }}
                  >
                    📋 Kopiera stream-URL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {onClose && (
                <Button size="sm" variant="ghost" onClick={onClose}>
                  Stäng
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Panel */}
      {diagnostics && (
        <div className="absolute bottom-2 left-2 z-30">
          <Collapsible open={showDiagnostics} onOpenChange={setShowDiagnostics}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 gap-1 text-xs text-white/60 hover:text-white hover:bg-white/10",
                  diagnostics.lastHttpStatus && "text-red-400"
                )}
              >
                <Bug className="h-3 w-3" />
                Diagnostik
                {showDiagnostics ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 rounded-lg bg-black/90 border border-white/10 p-3 text-xs text-white/80 space-y-1.5 min-w-[280px]">
                <div className="flex justify-between">
                  <span className="text-white/50">URL-typ:</span>
                  <span className="font-mono">{diagnostics.urlType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">TS-format:</span>
                  <span className={diagnostics.isTsFormat ? "text-yellow-400" : "text-green-400"}>
                    {diagnostics.isTsFormat ? "Ja ⚠️" : "Nej"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Proxad:</span>
                  <span className={diagnostics.isProxied ? "text-green-400" : "text-yellow-400"}>
                    {diagnostics.isProxied ? "Ja ✓" : "Nej"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Stream-protokoll:</span>
                  <span className={cn(
                    "font-mono",
                    diagnostics.protocol === 'https' ? "text-green-400" : "text-yellow-400"
                  )}>
                    {diagnostics.protocol.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Sida:</span>
                  <span className="font-mono">{diagnostics.pageProtocol}</span>
                </div>
                {diagnostics.isTsFormat && (
                  <div className="border-t border-yellow-500/30 pt-1.5 mt-1.5 bg-yellow-500/10 -mx-3 px-3 py-2 rounded">
                    <span className="text-yellow-300 block mb-2">
                      ⚠️ MPEG-TS-format kräver ofta extern spelare
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/20"
                      onClick={() => {
                        const url = originalStreamUrl || diagnostics.streamUrl;
                        window.open(buildExternalPlayerUrl(url, 'vlc'), '_blank');
                      }}
                    >
                      🎬 Öppna i VLC
                    </Button>
                  </div>
                )}
                {diagnostics.lastHttpStatus && (
                  <div className="flex justify-between border-t border-white/10 pt-1.5 mt-1.5">
                    <span className="text-white/50">HTTP-status:</span>
                    <span className="font-mono text-red-400">{diagnostics.lastHttpStatus}</span>
                  </div>
                )}
                {diagnostics.lastError && (
                  <div className="border-t border-white/10 pt-1.5 mt-1.5">
                    <span className="text-white/50 block mb-1">Senaste fel:</span>
                    <span className="font-mono text-red-300 text-[10px] break-all block">
                      {diagnostics.lastError.substring(0, 100)}
                    </span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-1.5 mt-1.5">
                  <span className="text-white/50 block mb-1">Stream-URL:</span>
                  <span className="font-mono text-[10px] break-all block text-white/70">
                    {diagnostics.streamUrl.substring(0, 80)}...
                  </span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Native HTML5 Video Player for MP4/MKV */}
      {useNativePlayer && (
        <div className="aspect-video w-full overflow-hidden rounded-xl shadow-2xl">
          <video
            ref={nativeVideoRef}
            src={effectiveSrc}
            className="h-full w-full"
            poster={poster}
            controls
            playsInline
            autoPlay={autoPlay}
            crossOrigin="anonymous"
            onError={handleNativeVideoError}
            onLoadedData={handleNativeVideoLoaded}
            onLoadStart={() => setIsLoading(true)}
            onTimeUpdate={handleNativeTimeUpdate}
            onPlay={handleNativePlay}
            onPause={handleNativePause}
            onEnded={onEnded}
          />
        </div>
      )}

      {/* Video.js container for HLS streams */}
      {!useNativePlayer && (
        <div 
          data-vjs-player 
          className="aspect-video w-full overflow-hidden rounded-xl shadow-2xl"
          onClick={togglePlay}
        >
          <div ref={videoRef} />
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && !playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none z-5">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

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
