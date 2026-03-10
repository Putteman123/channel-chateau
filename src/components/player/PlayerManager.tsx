import { useState, useCallback } from 'react';
import { ShakaPlayer, ShakaPlayerProps } from './ShakaPlayer';
import { ClapprPlayer } from './ClapprPlayer';
import { VideoPlayer } from './VideoPlayer';
import { NativeVideoPlayer } from './NativeVideoPlayer';
import { ExternalPlayerOptions } from './ExternalPlayerOptions';
import { usePlayerPreference, PlayerEngine } from '@/hooks/usePlayerPreference';
import { useNativePlatform } from '@/hooks/useNativePlatform';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';

export interface PlayerManagerProps extends Omit<ShakaPlayerProps, 'onError'> {
  /** Allow player hot-swap on error */
  allowHotSwap?: boolean;
  /** Original (non-proxied) stream URL for native player */
  originalStreamUrl?: string;
  /** URL to a WebVTT subtitle file */
  subtitleUrl?: string | null;
}

/** HTTP status codes that indicate provider-side blocking */
const PROVIDER_BLOCKING_CODES = new Set([458, 409, 551, 423, 502]);

function isProviderBlocking(httpStatus?: number): boolean {
  return !!httpStatus && PROVIDER_BLOCKING_CODES.has(httpStatus);
}

/**
 * PlayerManager - Renders the correct player based on platform and user preference
 * 
 * On Native (iOS/Android): Uses NativeVideoPlayer with ExoPlayer/AVPlayer
 * On Web: Uses Shaka Player (default) or Clappr based on user preference
 * Supports hot-swapping to alternative player on error
 * Shows ExternalPlayerOptions when provider blocks proxy playback
 */
export function PlayerManager({
  allowHotSwap = true,
  originalStreamUrl,
  ...playerProps
}: PlayerManagerProps) {
  const { preferredPlayer } = usePlayerPreference();
  const { isNative } = useNativePlatform();
  const [activePlayer, setActivePlayer] = useState<PlayerEngine>(preferredPlayer);
  const [errorOccurred, setErrorOccurred] = useState(false);
  const [showHotSwapPrompt, setShowHotSwapPrompt] = useState(false);
  const [showExternalOptions, setShowExternalOptions] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);

  // Compute the direct stream URL for external players
  const externalStreamUrl = originalStreamUrl || playerProps.src;

  // Handle player error — now receives optional httpStatus
  const handleError = useCallback((httpStatus?: number) => {
    setErrorOccurred(true);

    if (isProviderBlocking(httpStatus)) {
      console.log('[PlayerManager] Provider blocking detected (HTTP', httpStatus, ') — showing external player options');
      setShowExternalOptions(true);
      setShowHotSwapPrompt(false);
      return;
    }

    if (allowHotSwap && activePlayer !== 'clappr') {
      setShowHotSwapPrompt(true);
    }
  }, [allowHotSwap, activePlayer]);

  // Hot-swap to alternative player
  const handleHotSwap = useCallback(() => {
    console.log('[PlayerManager] Hot-swapping to Clappr');
    setActivePlayer('clappr');
    setShowHotSwapPrompt(false);
    setShowExternalOptions(false);
    setErrorOccurred(false);
    setPlayerKey(prev => prev + 1);
  }, []);

  // Retry with same player
  const handleRetry = useCallback(() => {
    setErrorOccurred(false);
    setShowHotSwapPrompt(false);
    setShowExternalOptions(false);
    setPlayerKey(prev => prev + 1);
  }, []);

  // 🚀 NATIVE PLATFORM: Use NativeVideoPlayer (ExoPlayer/AVPlayer)
  if (isNative) {
    console.log('[PlayerManager] 📱 Native platform detected - using NativeVideoPlayer');
    
    const nativeUrl = originalStreamUrl || playerProps.src;
    
    return (
      <NativeVideoPlayer
        key={playerKey}
        src={nativeUrl}
        title={playerProps.title}
        poster={playerProps.poster}
        onClose={playerProps.onClose}
        onProgress={playerProps.onProgress}
        onEnded={playerProps.onEnded}
        onError={() => handleError()}
        autoPlay={playerProps.autoPlay}
      />
    );
  }

  // Determine which player to render (Web)
  const renderPlayer = () => {
    const commonProps = {
      key: playerKey,
      ...playerProps,
    };

    switch (activePlayer) {
      case 'clappr':
        return (
          <ClapprPlayer
            {...commonProps}
            onError={() => handleError()}
          />
        );

      case 'videojs':
        return (
          <VideoPlayer
            {...commonProps}
            originalStreamUrl={originalStreamUrl}
          />
        );
      
      case 'native':
      case 'shaka':
      default:
        return (
          <ShakaPlayer
            {...commonProps}
            onProviderBlocking={(status) => handleError(status)}
          />
        );
    }
  };

  return (
    <div className="relative h-full w-full">
      {renderPlayer()}

      {/* Provider blocking overlay — show ExternalPlayerOptions */}
      {showExternalOptions && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-md">
            <Button
              size="icon"
              variant="ghost"
              className="absolute -right-2 -top-2 z-10 text-muted-foreground hover:text-foreground"
              onClick={handleRetry}
            >
              <X className="h-4 w-4" />
            </Button>
            <ExternalPlayerOptions
              streamUrl={externalStreamUrl}
              channelName={playerProps.title || 'Stream'}
            />
            <div className="mt-3 flex justify-center">
              <Button size="sm" variant="ghost" onClick={handleRetry} className="gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3" />
                Försök spela i webbläsaren igen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hot-swap prompt overlay (for non-blocking errors) */}
      {showHotSwapPrompt && !showExternalOptions && (
        <div className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-3 rounded-lg bg-background/95 p-4 shadow-lg backdrop-blur">
            <span className="text-sm text-muted-foreground">
              Uppspelningen misslyckades.
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={handleHotSwap}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Prova med Clappr
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRetry}
            >
              Försök igen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
