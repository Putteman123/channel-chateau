import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import shaka from 'shaka-player/dist/shaka-player.ui';
import 'shaka-player/dist/controls.css';
import { X, ExternalLink, Bug, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  isTsStream,
  hasMixedContentIssue,
} from '@/lib/stream-utils';

/** Custom HTTP headers for stream requests (from M3U #EXTVLCOPT) */
export interface StreamHttpHeaders {
  userAgent?: string;
  referer?: string;
}

export interface ShakaPlayerProps {
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

interface PlayerError {
  type: 'mixed-content' | 'cors' | 'network' | 'decode' | 'ts-format' | 'unknown';
  message: string;
  details?: string;
  code?: number;
  httpStatus?: number;
}

interface DiagnosticsInfo {
  streamUrl: string;
  urlType: string;
  isProxied: boolean;
  protocol: 'http' | 'https';
  pageProtocol: string;
  isTsFormat: boolean;
  lastError?: string;
  lastHttpStatus?: number;
  shakaVersion?: string;
}

function diagnoseError(
  src: string, 
  errorCode?: number, 
  errorCategory?: number, 
  errorMessage?: string,
  httpStatus?: number
): PlayerError {
  const isHttpSource = src.startsWith('http://');
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // HTTP 458 - Provider actively blocking proxy/datacenter IPs
  if (httpStatus === 458 || errorMessage?.includes('458')) {
    return {
      type: 'network',
      message: 'Leverantören blockerar proxy-uppspelning',
      details: 'Din IPTV-leverantör tillåter inte uppspelning via vår proxy (datacenter-IP). Öppna strömmen i VLC eller annan extern spelare för att spela via din egen IP.',
      code: errorCode,
      httpStatus: 458,
    };
  }

  // HTTP 502 - Upstream unreachable (often also blocking)
  if (httpStatus === 502 || errorMessage?.includes('502') || errorMessage?.includes('Upstream unreachable')) {
    return {
      type: 'network',
      message: 'Kunde inte ansluta till strömkällan',
      details: 'Proxy-servern kunde inte nå IPTV-leverantören. Detta kan bero på blockering eller att servern är nere. Prova öppna i VLC.',
      code: errorCode,
      httpStatus: 502,
    };
  }

  // Connection refused
  if (errorMessage?.includes('ECONNREFUSED') || errorMessage?.includes('Connection refused')) {
    return {
      type: 'network',
      message: 'Anslutning nekad av leverantören',
      details: 'IPTV-leverantören nekar anslutningar från datacenter. Öppna strömmen i VLC eller annan extern spelare.',
      code: errorCode,
      httpStatus: 502,
    };
  }

  // Mixed Content
  if (isHttpSource && isHttpsPage) {
    return {
      type: 'mixed-content',
      message: 'Strömmen blockeras av Mixed Content-skydd',
      details: 'HTTPS-sidan kan inte ladda HTTP-strömmar direkt. Strömmen måste gå via proxy eller öppnas i extern spelare.',
      code: errorCode,
    };
  }

  // Shaka error categories
  // Category 1: Network errors
  if (errorCategory === 1) {
    // Check for fetch failures (often Mixed Content or CORS)
    if (errorMessage?.includes('Failed to fetch')) {
      if (isHttpSource && isHttpsPage) {
        return {
          type: 'mixed-content',
          message: 'Strömmen blockeras av webbläsarens säkerhetsskydd',
          details: 'Webbläsaren blockerar HTTP-strömmar på HTTPS-sidor (Mixed Content). Öppna i VLC eller använd proxy.',
          code: errorCode,
        };
      }
    }
    
    return {
      type: 'network',
      message: 'Nätverksfel vid laddning av ström',
      details: errorMessage || 'Kontrollera din anslutning och att streamkällan är tillgänglig.',
      code: errorCode,
    };
  }

  // Category 3: Media errors
  if (errorCategory === 3) {
    return {
      type: 'decode',
      message: 'Kunde inte avkoda strömmen',
      details: errorMessage || 'Formatet stöds inte av webbläsaren. Prova öppna i VLC.',
      code: errorCode,
    };
  }

  // Category 4: Manifest errors
  if (errorCategory === 4) {
    return {
      type: 'network',
      message: 'Kunde inte läsa manifestfilen',
      details: errorMessage || 'Strömmen kan vara offline eller URL:en felaktig.',
      code: errorCode,
    };
  }

  // Shaka specific error codes
  // 1002 = HTTP_ERROR
  if (errorCode === 1002) {
    return {
      type: 'network',
      message: 'HTTP-fel vid hämtning av ström',
      details: errorMessage || 'Servern returnerade ett fel. Strömmen kan vara otillgänglig. Prova öppna i VLC.',
      code: errorCode,
    };
  }

  return {
    type: 'unknown',
    message: 'Ett okänt fel uppstod',
    details: errorMessage || `Felkod: ${errorCode || 'Okänd'}. Prova öppna i VLC.`,
    code: errorCode,
  };
}

/**
 * Check if URL should use native HTML5 video instead of Shaka
 * MP4/MKV files often contain codecs (like HEVC) that Shaka/MSE can't decode
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

export function ShakaPlayer({
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
}: ShakaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<shaka.Player | null>(null);
  const uiRef = useRef<shaka.ui.Overlay | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const [showControls, setShowControls] = useState(true);
  const [playerError, setPlayerError] = useState<PlayerError | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  const { isTvMode } = useSpatialNavigation();

  // Determine if we should use native HTML5 video - synkront med useMemo
  const useNativePlayer = useMemo(() => {
    const shouldUseNative = shouldUseNativePlayer(src);
    if (shouldUseNative) {
      console.log('[ShakaPlayer] Using native HTML5 video for MP4/MKV format');
    }
    return shouldUseNative;
  }, [src]);

  // Track component mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Build effective source URL with headers
  const effectiveSrc = useMemo(() => {
    if (!httpHeaders || (!httpHeaders.userAgent && !httpHeaders.referer)) {
      return src;
    }

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

  // Get URL for external players
  const externalUrl = useMemo(() => {
    if (originalStreamUrl) return originalStreamUrl;
    if (isProxiedUrl(effectiveSrc)) {
      const extracted = extractOriginalFromProxy(effectiveSrc);
      if (extracted) return extracted;
    }
    return effectiveSrc;
  }, [effectiveSrc, originalStreamUrl]);

  // Analyze stream URL and set diagnostics
  useEffect(() => {
    if (effectiveSrc) {
      const urlType = effectiveSrc.includes('.m3u8') ? 'HLS (.m3u8)'
        : effectiveSrc.includes('.ts') ? 'MPEG-TS (.ts)'
        : effectiveSrc.includes('.mp4') ? 'MP4'
        : effectiveSrc.includes('.mkv') ? 'MKV'
        : 'Okänd';

      const isProxied = isProxiedUrl(effectiveSrc);
      const protocol = effectiveSrc.startsWith('https') ? 'https' : 'http';
      const pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'unknown';

      let displayUrl = effectiveSrc;
      if (isProxied) {
        const extracted = extractOriginalFromProxy(effectiveSrc);
        if (extracted) displayUrl = extracted;
      }

      const tsFormat = isTsStream(displayUrl);

      setDiagnostics({
        streamUrl: displayUrl,
        urlType,
        isProxied,
        protocol,
        pageProtocol,
        isTsFormat: tsFormat,
        shakaVersion: shaka.Player.version,
      });

      console.log('[ShakaPlayer] Original URL:', displayUrl);
      console.log('[ShakaPlayer] Effective URL:', effectiveSrc);
      console.log('[ShakaPlayer] Shaka Player version:', shaka.Player.version);
    }
  }, [effectiveSrc]);

  // Configure and initialize Shaka Player
  const initPlayer = useCallback(async () => {
    // Defensive checks - skip if using native player or refs not ready
    if (useNativePlayer) {
      console.log('[ShakaPlayer] Skipping Shaka init - using native player');
      return;
    }

    if (!videoRef.current || !containerRef.current) {
      console.warn('[ShakaPlayer] Refs not ready, skipping init');
      return;
    }

    // Extra check for component unmount
    if (!isMountedRef.current) {
      console.warn('[ShakaPlayer] Component unmounted, skipping init');
      return;
    }

    // Install polyfills
    shaka.polyfill.installAll();

    if (!shaka.Player.isBrowserSupported()) {
      console.error('[ShakaPlayer] Browser not supported!');
      setPlayerError({
        type: 'unknown',
        message: 'Webbläsaren stöds inte',
        details: 'Din webbläsare stöder inte Shaka Player. Använd en extern spelare.',
      });
      return;
    }

    // Create player
    const player = new shaka.Player();
    await player.attach(videoRef.current);
    playerRef.current = player;

    // Configure player for resilience
    player.configure({
      streaming: {
        retryParameters: {
          maxAttempts: 5,
          baseDelay: 1000,
          backoffFactor: 2,
          fuzzFactor: 0.5,
          timeout: 30000,
        },
        bufferingGoal: 30,
        rebufferingGoal: 2,
        bufferBehind: 30,
        stallEnabled: true,
        stallThreshold: 1,
        stallSkip: 0.1,
      },
      manifest: {
        retryParameters: {
          maxAttempts: 5,
          baseDelay: 1000,
          backoffFactor: 2,
          fuzzFactor: 0.5,
          timeout: 30000,
        },
      },
      drm: {
        retryParameters: {
          maxAttempts: 3,
          baseDelay: 1000,
          backoffFactor: 2,
          fuzzFactor: 0.5,
          timeout: 30000,
        },
      },
    });

    // Configure network request filters for custom headers
    player.getNetworkingEngine()?.registerRequestFilter((type, request) => {
      if (httpHeaders?.userAgent) {
        request.headers['User-Agent'] = httpHeaders.userAgent;
      }
      if (httpHeaders?.referer) {
        request.headers['Referer'] = httpHeaders.referer;
      }
      // Allow credentials for CORS
      request.allowCrossSiteCredentials = false;
    });

    // Set up UI overlay with Shaka's built-in controls
    const ui = new shaka.ui.Overlay(player, containerRef.current, videoRef.current);
    uiRef.current = ui;

    // Configure UI
    ui.configure({
      addSeekBar: true,
      addBigPlayButton: true,
      controlPanelElements: [
        'play_pause',
        'time_and_duration',
        'spacer',
        'mute',
        'volume',
        'fullscreen',
        'overflow_menu',
      ],
      overflowMenuButtons: [
        'quality',
        'language',
        'playback_rate',
        'captions',
      ],
      seekBarColors: {
        base: 'rgba(255, 255, 255, 0.3)',
        buffered: 'rgba(255, 255, 255, 0.54)',
        played: 'hsl(var(--primary))',
      },
    });

    // Error handling with auto-retry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    player.addEventListener('error', (event: any) => {
      const error = event.detail;
      console.error('[ShakaPlayer] Error:', error);

      // Auto-retry for network errors (code 1002)
      if (error.code === 1002 && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log(`[ShakaPlayer] Retrying... (${retryCountRef.current}/${maxRetries})`);
        
        setTimeout(async () => {
          try {
            await player.load(effectiveSrc);
            if (startPosition > 0 && videoRef.current) {
              videoRef.current.currentTime = startPosition;
            }
            if (autoPlay) {
              videoRef.current?.play();
            }
          } catch (retryError) {
            console.error('[ShakaPlayer] Retry failed:', retryError);
          }
        }, 2000 * retryCountRef.current);
        return;
      }

      const diagnosis = diagnoseError(
        effectiveSrc,
        error.code,
        error.category,
        error.message,
        error.data?.[1] // HTTP status if available
      );
      setPlayerError(diagnosis);
      setDiagnostics(prev => prev ? {
        ...prev,
        lastError: error.message,
        lastHttpStatus: error.data?.[1] || diagnosis.httpStatus,
      } : null);
    });

    // Buffering state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    player.addEventListener('buffering', (event: any) => {
      setIsLoading(event.buffering);
    });

    // Load the stream
    try {
      setIsLoading(true);
      setPlayerError(null);
      retryCountRef.current = 0;

      await player.load(effectiveSrc);
      console.log('[ShakaPlayer] Stream loaded successfully');

      // Set start position
      if (startPosition > 0 && videoRef.current) {
        videoRef.current.currentTime = startPosition;
      }

      // Auto play
      if (autoPlay && videoRef.current) {
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.warn('[ShakaPlayer] Autoplay blocked:', playError);
        }
      }

      setIsLoading(false);
    } catch (loadError: any) {
      console.error('[ShakaPlayer] Load error:', loadError);
      setIsLoading(false);

      const diagnosis = diagnoseError(
        effectiveSrc,
        loadError.code,
        loadError.category,
        loadError.message,
        loadError.data?.[1]
      );
      setPlayerError(diagnosis);
    }
  }, [effectiveSrc, autoPlay, startPosition, httpHeaders, useNativePlayer]);

  // Initialize Shaka player only for HLS streams (skip for native player)
  useEffect(() => {
    if (useNativePlayer) {
      setIsLoading(false);
      return;
    }

    initPlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      if (uiRef.current) {
        uiRef.current.destroy();
        uiRef.current = null;
      }
    };
  }, [initPlayer, useNativePlayer]);

  // Handle video ended event - works for both native and Shaka player
  useEffect(() => {
    const video = useNativePlayer ? nativeVideoRef.current : videoRef.current;
    if (!video) return;

    const handleEnded = () => onEnded?.();
    video.addEventListener('ended', handleEnded);

    return () => video.removeEventListener('ended', handleEnded);
  }, [onEnded, useNativePlayer]);

  // Progress tracking - works for both native and Shaka player
  useEffect(() => {
    const video = useNativePlayer ? nativeVideoRef.current : videoRef.current;
    if (onProgress && video) {
      progressIntervalRef.current = setInterval(() => {
        if (video && video.duration > 0) {
          onProgress(video.currentTime, video.duration);
        }
      }, 5000);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [onProgress, useNativePlayer]);

  // TV mode keyboard handling - works for both native and Shaka player
  useEffect(() => {
    if (!isTvMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const video = useNativePlayer ? nativeVideoRef.current : videoRef.current;
      if (!video) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          break;
        case ' ':
          e.preventDefault();
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          onClose?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isTvMode, onClose, useNativePlayer]);

  const handleRetry = async () => {
    setPlayerError(null);
    retryCountRef.current = 0;

    if (useNativePlayer && nativeVideoRef.current) {
      // Retry native player
      nativeVideoRef.current.load();
      if (startPosition > 0) {
        nativeVideoRef.current.currentTime = startPosition;
      }
      if (autoPlay) {
        nativeVideoRef.current.play();
      }
    } else if (playerRef.current) {
      try {
        await playerRef.current.load(effectiveSrc);
        if (startPosition > 0 && videoRef.current) {
          videoRef.current.currentTime = startPosition;
        }
        if (autoPlay && videoRef.current) {
          videoRef.current.play();
        }
      } catch (error) {
        console.error('[ShakaPlayer] Retry load error:', error);
      }
    }
  };

  // Handle native video error - fallback to external player
  const handleNativeVideoError = () => {
    console.error('[ShakaPlayer] Native video error - codec may not be supported');
    setPlayerError({
      type: 'decode',
      message: 'Filformatet stöds ej av webbläsaren',
      details: 'Videon kan innehålla codecs (t.ex. HEVC/H.265) som din webbläsare inte kan spela upp. Öppna i en extern spelare som VLC.',
    });
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
  };

  const handleOpenExternal = (player: 'vlc' | 'mpv' | 'iina' | 'copy') => {
    if (player === 'copy') {
      navigator.clipboard.writeText(externalUrl);
      return;
    }
    const url = buildExternalPlayerUrl(externalUrl, player);
    if (url) window.open(url, '_blank');
  };

  return (
    <div className="relative h-full w-full bg-black">
      {/* Title overlay with close button */}
      {(title || onClose) && (
        <div className={cn(
          "absolute left-0 right-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
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
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 p-4 overflow-auto">
          <div className="max-w-lg w-full space-y-4">
            <Alert 
              variant="destructive" 
              className={cn(
                "border",
                playerError.httpStatus === 458 
                  ? "bg-yellow-500/20 border-yellow-500/50" 
                  : "bg-destructive/20 border-destructive"
              )}
            >
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="text-lg">{playerError.message}</AlertTitle>
              <AlertDescription className="mt-2 text-sm opacity-90">
                {playerError.details}
                {playerError.code && (
                  <span className="block mt-1 text-xs opacity-70">
                    Felkod: {playerError.code}
                    {playerError.httpStatus && ` (HTTP ${playerError.httpStatus})`}
                  </span>
                )}
              </AlertDescription>
            </Alert>

            {/* Prominent VLC button for provider blocking (458) */}
            {(playerError.httpStatus === 458 || playerError.httpStatus === 502) && (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 space-y-3">
                <p className="text-sm font-medium text-primary">
                  ✓ Rekommenderad lösning:
                </p>
                <p className="text-xs text-muted-foreground">
                  Öppna strömmen i en extern spelare som körs på din dator. 
                  Detta använder din hem-IP istället för våra servrar.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    onClick={() => handleOpenExternal('vlc')}
                    className="flex-1 min-w-[120px]"
                  >
                    Öppna i VLC
                  </Button>
                  <Button 
                    onClick={() => handleOpenExternal('mpv')}
                    variant="secondary"
                    className="flex-1 min-w-[120px]"
                  >
                    Öppna i MPV
                  </Button>
                </div>
                <Button 
                  onClick={() => handleOpenExternal('copy')}
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                >
                  Kopiera direktlänk till urklipp
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleRetry} variant="secondary">
                Försök igen
              </Button>

              {/* Only show dropdown if not already showing prominent buttons */}
              {playerError.httpStatus !== 458 && playerError.httpStatus !== 502 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Öppna externt
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
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
                      Kopiera URL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {onClose && (
                <Button variant="ghost" onClick={onClose}>
                  Stäng
                </Button>
              )}
            </div>

            {/* Diagnostics */}
            <Collapsible open={showDiagnostics} onOpenChange={setShowDiagnostics}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    Diagnostik
                  </span>
                  {showDiagnostics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                {diagnostics && (
                  <div className="rounded border border-border bg-muted/30 p-3 font-mono text-xs space-y-1">
                    <p><strong>Shaka:</strong> v{diagnostics.shakaVersion}</p>
                    <p><strong>URL:</strong> <span className="break-all">{diagnostics.streamUrl}</span></p>
                    <p><strong>Typ:</strong> {diagnostics.urlType}</p>
                    <p><strong>Proxy:</strong> {diagnostics.isProxied ? 'Ja' : 'Nej'}</p>
                    <p><strong>Protokoll:</strong> Sida: {diagnostics.pageProtocol} / Ström: {diagnostics.protocol}</p>
                    {diagnostics.lastError && (
                      <p><strong>Senaste fel:</strong> {diagnostics.lastError}</p>
                    )}
                    {diagnostics.lastHttpStatus && (
                      <p><strong>HTTP-status:</strong> {diagnostics.lastHttpStatus}</p>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      )}

      {/* Native HTML5 Video Player for MP4/MKV */}
      {useNativePlayer && (
        <div className="h-full w-full" onMouseMove={() => setShowControls(true)}>
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
          />
        </div>
      )}

      {/* Shaka Player Container for HLS/other streams */}
      {!useNativePlayer && (
        <div
          ref={containerRef}
          className="shaka-video-container h-full w-full"
          data-shaka-player-container
          onMouseMove={() => setShowControls(true)}
        >
          <video
            ref={videoRef}
            className="h-full w-full"
            poster={poster}
            playsInline
            data-shaka-player
          />
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && !playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none z-10">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}
