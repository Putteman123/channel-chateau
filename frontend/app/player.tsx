import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Video } from 'expo-av';
import { useTheme } from '../src/hooks/useTheme';

// Helper to encode URL for proxy
const encodeUrlForProxy = (url: string): string => {
  if (typeof btoa !== 'undefined') {
    return btoa(url);
  }
  // Node.js fallback
  return Buffer.from(url).toString('base64');
};

// Get proxy URL for video streams
const getProxyUrl = (originalUrl: string): string => {
  if (Platform.OS !== 'web') {
    // Native apps don't need proxy
    return originalUrl;
  }
  
  const encodedUrl = encodeUrlForProxy(originalUrl);
  
  // Use m3u8 proxy for HLS streams, otherwise use stream proxy
  if (originalUrl.includes('.m3u8')) {
    return `/api/proxy/m3u8?url=${encodedUrl}`;
  }
  return `/api/proxy/stream?url=${encodedUrl}`;
};

// Web video player using Video.js for better HLS support and controls
function WebVideoPlayer({ 
  url, 
  onError, 
  onLoad, 
  onPlaybackStatusUpdate 
}: { 
  url: string; 
  onError: (error: string) => void;
  onLoad: () => void;
  onPlaybackStatusUpdate: (status: { isPlaying: boolean; isBuffering: boolean }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    // Dynamically import Video.js (client-side only)
    const initializePlayer = async () => {
      try {
        // Import Video.js and its CSS
        const videojs = (await import('video.js')).default;
        await import('video.js/dist/video-js.css');
        await import('@videojs/http-streaming');

        // Initialize Video.js player
        const player = videojs(videoRef.current!, {
          controls: true,
          autoplay: true,
          preload: 'auto',
          fluid: true,
          responsive: true,
          html5: {
            vhs: {
              enableLowInitialPlaylist: true,
              smoothQualityChange: true,
              overrideNative: true,
            },
            nativeAudioTracks: false,
            nativeVideoTracks: false,
          },
        });

        // Set source
        player.src({
          src: url,
          type: url.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4',
        });

        // Event listeners
        player.on('loadeddata', () => {
          console.log('Video loaded');
          onLoad();
          onPlaybackStatusUpdate({ isPlaying: false, isBuffering: false });
        });

        player.on('play', () => {
          console.log('Video playing');
          onPlaybackStatusUpdate({ isPlaying: true, isBuffering: false });
        });

        player.on('pause', () => {
          console.log('Video paused');
          onPlaybackStatusUpdate({ isPlaying: false, isBuffering: false });
        });

        player.on('waiting', () => {
          console.log('Video buffering');
          onPlaybackStatusUpdate({ isPlaying: player.paused(), isBuffering: true });
        });

        player.on('playing', () => {
          console.log('Video resumed from buffering');
          onPlaybackStatusUpdate({ isPlaying: true, isBuffering: false });
        });

        player.on('error', (e: any) => {
          const error = player.error();
          console.error('Video.js error:', error);
          let errorMessage = 'Kunde inte spela strömmen.';
          
          if (error) {
            switch (error.code) {
              case 1:
                errorMessage = 'Video laddning avbruten.';
                break;
              case 2:
                errorMessage = 'Nätverksfel vid laddning av video.';
                break;
              case 3:
                errorMessage = 'Video-dekodning misslyckades.';
                break;
              case 4:
                errorMessage = 'Video-formatet stöds inte.';
                break;
              default:
                errorMessage = error.message || 'Okänt fel vid uppspelning.';
            }
          }
          
          onError(errorMessage);
        });

        playerRef.current = player;

      } catch (error) {
        console.error('Failed to initialize Video.js:', error);
        onError('Kunde inte ladda video-spelaren.');
      }
    };

    initializePlayer();

    // Cleanup
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [url]);

  return (
    <View style={styles.webVideoContainer}>
      <div data-vjs-player>
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered"
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </div>
    </View>
  );
}

 

export default function PlayerScreen() {
  const router = useRouter();
  const { url, name, logo } = useLocalSearchParams<{ url: string; name: string; logo?: string }>();
  const { colors } = useTheme();
  
  // Get the proxied URL for web platform
  const streamUrl = url ? getProxyUrl(url) : '';
  
  const videoRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenOrientation.unlockAsync();
    }
    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    };
  }, []);

  useEffect(() => {
    if (showControls && isPlaying) {
      resetControlsTimeout();
    }
    return () => {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, [showControls, isPlaying]);

  const resetControlsTimeout = () => {
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 4000);
  };

  const toggleControls = () => {
    setShowControls(prev => !prev);
  };

  const handleLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleError = (err: any) => {
    console.error('Video error:', err);
    const errorMessage = Platform.OS === 'web' 
      ? 'Kunde inte spela strömmen. Försöker via proxy...'
      : 'Kunde inte spela upp strömmen. Kontrollera din internetanslutning.';
    setError(errorMessage);
    setIsLoading(false);
  };

  const handleBuffer = ({ isBuffering: buffering }: { isBuffering: boolean }) => {
    setIsBuffering(buffering);
  };

  const handleProgress = (data: any) => {
    if (data.currentTime) {
      setCurrentTime(data.currentTime);
    }
    if (data.playableDuration) {
      setDuration(data.playableDuration);
    }
  };

  const handlePlaybackStatusUpdate = (status: { isPlaying: boolean; isBuffering: boolean }) => {
    setIsPlaying(status.isPlaying);
    setIsBuffering(status.isBuffering);
  };

  const toggleFullscreen = async () => {
    if (Platform.OS !== 'web') {
      if (isFullscreen) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      }
      setIsFullscreen(!isFullscreen);
    }
  };

  const togglePlayPause = () => {
    if (Platform.OS === 'web' || !videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pauseAsync?.();
    } else {
      videoRef.current.playAsync?.();
    }
    setIsPlaying(!isPlaying);
  };

  const renderVideoPlayer = () => {
    if (!url) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ff6b6b" />
          <Text style={styles.errorText}>Ingen URL angiven</Text>
        </View>
      );
    }

    if (Platform.OS === 'web') {
      return (
        <WebVideoPlayer
          url={streamUrl}
          onError={handleError}
          onLoad={handleLoad}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        />
      );
    }

    
    // Fallback to expo-av
    if (Video) {
      return (
        <Video
          ref={videoRef}
          source={{ uri: streamUrl }}
          style={styles.video}
          resizeMode="contain"
          shouldPlay={isPlaying}
          isLooping={false}
          onPlaybackStatusUpdate={(status: any) => {
            if (status.isLoaded) {
              setIsLoading(false);
              setIsPlaying(status.isPlaying);
              setIsBuffering(status.isBuffering);
            }
          }}
          onError={handleError}
          useNativeControls={false}
        />
      );
    }

    return (
      <View style={styles.errorContainer}>
        <Ionicons name="videocam-off" size={48} color="#ff6b6b" />
        <Text style={styles.errorText}>Videospelare inte tillgänglig</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={!showControls} />
      
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={toggleControls}
      >
        {renderVideoPlayer()}

        {(isLoading || isBuffering) && !error && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>
              {isBuffering ? 'Buffrar...' : 'Laddar...'}
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorOverlay}>
            <Ionicons name="alert-circle" size={48} color="#ff6b6b" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setError(null);
                setIsLoading(true);
                setIsPlaying(true);
              }}
            >
              <Text style={styles.retryText}>Försök igen</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {showControls && (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          <View style={styles.topControls}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={28} color="#ffffff" />
            </TouchableOpacity>
            
            <View style={styles.titleContainer}>
              {logo ? (
                <Image source={{ uri: logo }} style={styles.channelLogo} resizeMode="contain" />
              ) : null}
              <Text style={styles.channelName} numberOfLines={1}>
                {name || 'Okänd kanal'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.fullscreenButton}
              onPress={toggleFullscreen}
            >
              <Ionicons
                name={isFullscreen ? 'contract' : 'expand'}
                size={24}
                color="#ffffff"
              />
            </TouchableOpacity>
          </View>

          {Platform.OS !== 'web' && (
            <View style={styles.centerControls}>
              <TouchableOpacity
                style={styles.playButton}
                onPress={togglePlayPause}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={48}
                  color="#ffffff"
                />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.bottomControls}>
            <View style={[styles.liveIndicator, { backgroundColor: '#ff0000' }]}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  webVideoContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 12,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    padding: 32,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6200ee',
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  channelLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
    borderRadius: 4,
  },
  channelName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  fullscreenButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerControls: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 16,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    marginRight: 6,
  },
  liveText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
