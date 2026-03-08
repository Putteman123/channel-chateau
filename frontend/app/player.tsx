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

// Web video player using HLS.js for better HLS support
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
  const hlsRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Event handlers
    const handlePlay = () => {
      setIsPlaying(true);
      onPlaybackStatusUpdate({ isPlaying: true, isBuffering: false });
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      onPlaybackStatusUpdate({ isPlaying: false, isBuffering: false });
    };
    
    const handleWaiting = () => {
      onPlaybackStatusUpdate({ isPlaying: isPlaying, isBuffering: true });
    };
    
    const handleCanPlay = () => {
      onLoad();
      onPlaybackStatusUpdate({ isPlaying: isPlaying, isBuffering: false });
    };
    
    const handlePlaying = () => {
      onLoad();
      onPlaybackStatusUpdate({ isPlaying: isPlaying, isBuffering: false });
    };
    
    const handleError = (e: any) => {
      console.error('Video error:', e);
      onError('Kunde inte spela strömmen. Kontrollera din internetanslutning.');
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);

    // Load HLS.js if needed
    const loadVideo = async () => {
      if (url.includes('.m3u8') || url.includes('/api/proxy/m3u8')) {
        // Use HLS.js for M3U8 streams
        try {
          const Hls = (await import('hls.js')).default;
          
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false,
              backBufferLength: 90,
              maxBufferLength: 30,
              maxMaxBufferLength: 60,
            });
            
            hls.loadSource(url);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.log('HLS manifest parsed');
              video.play().catch(e => console.log('Autoplay prevented:', e));
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
              console.error('HLS error:', data);
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log('Network error, trying to recover...');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log('Media error, trying to recover...');
                    hls.recoverMediaError();
                    break;
                  default:
                    onError('Ett kritiskt fel inträffade vid uppspelning.');
                    hls.destroy();
                    break;
                }
              }
            });
            
            hlsRef.current = hls;
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            video.src = url;
            video.play().catch(e => console.log('Autoplay prevented:', e));
          } else {
            onError('Din webbläsare stöder inte HLS-streaming.');
          }
        } catch (error) {
          console.error('Failed to load HLS.js:', error);
          onError('Kunde inte ladda video-spelaren.');
        }
      } else {
        // Direct MP4 or other formats
        video.src = url;
        video.play().catch(e => console.log('Autoplay prevented:', e));
      }
    };

    loadVideo();

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
      
      // Cleanup HLS.js
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url]);

  return (
    <View style={styles.webVideoContainer}>
      <video
        ref={videoRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          objectFit: 'contain',
        }}
        playsInline
        controls={true}
      />
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
    if (Platform.OS === 'web') return;
    
    if (VideoNative && videoRef.current) {
      setIsPlaying(!isPlaying);
      // react-native-video uses paused prop, we toggle it via state
    } else if (Video && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pauseAsync?.();
      } else {
        videoRef.current.playAsync?.();
      }
      setIsPlaying(!isPlaying);
    }
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

    // Native player
    if (VideoNative) {
      return (
        <VideoNative
          ref={videoRef}
          source={{ uri: streamUrl }}
          style={styles.video}
          resizeMode="contain"
          onLoad={handleLoad}
          onError={handleError}
          onBuffer={handleBuffer}
          onProgress={handleProgress}
          repeat={false}
          controls={false}
          paused={!isPlaying}
          bufferConfig={{
            minBufferMs: 15000,
            maxBufferMs: 50000,
            bufferForPlaybackMs: 2500,
            bufferForPlaybackAfterRebufferMs: 5000,
          }}
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
