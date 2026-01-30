import { useState, useCallback } from 'react';
import { ShakaPlayer, ShakaPlayerProps } from './ShakaPlayer';
import { ClapprPlayer, ClapprPlayerProps } from './ClapprPlayer';
import { NativeVideoPlayer, NativeVideoPlayerProps } from './NativeVideoPlayer';
import { usePlayerPreference, PlayerEngine } from '@/hooks/usePlayerPreference';
import { useNativePlatform } from '@/hooks/useNativePlatform';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export interface PlayerManagerProps extends Omit<ShakaPlayerProps, 'onError'> {
  /** Allow player hot-swap on error */
  allowHotSwap?: boolean;
  /** Original (non-proxied) stream URL for native player */
  originalStreamUrl?: string;
}

/**
 * PlayerManager - Renders the correct player based on platform and user preference
 * 
 * On Native (iOS/Android): Uses NativeVideoPlayer with ExoPlayer/AVPlayer
 * On Web: Uses Shaka Player (default) or Clappr based on user preference
 * Supports hot-swapping to alternative player on error
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
  const [playerKey, setPlayerKey] = useState(0);

  // Handle player error
  const handleError = useCallback(() => {
    setErrorOccurred(true);
    if (allowHotSwap && activePlayer !== 'clappr') {
      setShowHotSwapPrompt(true);
    }
  }, [allowHotSwap, activePlayer]);

  // Hot-swap to alternative player
  const handleHotSwap = useCallback(() => {
    console.log('[PlayerManager] Hot-swapping to Clappr');
    setActivePlayer('clappr');
    setShowHotSwapPrompt(false);
    setErrorOccurred(false);
    setPlayerKey(prev => prev + 1); // Force re-mount
  }, []);

  // Retry with same player
  const handleRetry = useCallback(() => {
    setErrorOccurred(false);
    setShowHotSwapPrompt(false);
    setPlayerKey(prev => prev + 1);
  }, []);

  // 🚀 NATIVE PLATFORM: Use NativeVideoPlayer (ExoPlayer/AVPlayer)
  if (isNative) {
    console.log('[PlayerManager] 📱 Native platform detected - using NativeVideoPlayer');
    
    // Use original (non-proxied) URL for native player
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
        onError={handleError}
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
            onError={handleError}
          />
        );
      
      case 'native':
        // Native HTML5 video - fallback to Shaka which handles this internally
        return (
          <ShakaPlayer
            {...commonProps}
          />
        );
      
      case 'shaka':
      default:
        return (
          <ShakaPlayer
            {...commonProps}
          />
        );
    }
  };

  return (
    <div className="relative h-full w-full">
      {renderPlayer()}

      {/* Hot-swap prompt overlay */}
      {showHotSwapPrompt && (
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
