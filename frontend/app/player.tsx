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
import { useTheme } from '../src/hooks/useTheme';

// Conditionally import Video for native platforms
let Video: any = null;
let ResizeMode: any = null;
if (Platform.OS !== 'web') {
  const AV = require('expo-av');
  Video = AV.Video;
  ResizeMode = AV.ResizeMode;
}

// Web video player component
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
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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
    
    const handleError = () => {
      onError('Kunde inte spela upp strömmen');
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    // Try to auto-play
    video.play().catch(() => {
      // Auto-play blocked, user needs to interact
    });

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, [url]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
  };

  return (
    <View style={styles.webVideoContainer}>
      <video
        ref={videoRef}
        src={url}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          objectFit: 'contain',
        }}
        playsInline
        controls={false}
      />
      <TouchableOpacity 
        style={styles.webPlayOverlay}
        onPress={togglePlay}
        activeOpacity={0.8}
      >
        <View style={styles.webPlayButton}>
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={48}
            color="#ffffff"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function PlayerScreen() {
  const router = useRouter();
  const { url, name, logo } = useLocalSearchParams<{ url: string; name: string; logo?: string }>();
  const { colors } = useTheme();
  
  const videoRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Lock to landscape when entering player on mobile
    if (Platform.OS !== 'web') {
      ScreenOrientation.unlockAsync();
    }

    return () => {
      // Reset orientation when leaving
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    };
  }, []);

  useEffect(() => {
    if (showControls) {
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

  const handlePlaybackStatusUpdate = (status: { isPlaying: boolean; isBuffering: boolean }) => {
    setIsPlaying(status.isPlaying);
    setIsBuffering(status.isBuffering);
  };

  const handleNativePlaybackStatusUpdate = (newStatus: any) => {
    if (newStatus.isLoaded) {
      setIsLoading(false);
      setError(null);
      setIsPlaying(newStatus.isPlaying || false);
      setIsBuffering(newStatus.isBuffering || false);
    }
  };

  const handleError = (errorMessage: string) => {
    console.error('Video error:', errorMessage);
    setError('Kunde inte spela upp strömmen. Kontrollera att URL:en är korrekt.');
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const toggleFullscreen = async () => {
    if (Platform.OS !== 'web') {
      if (isFullscreen) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      }
      setIsFullscreen(!isFullscreen);
    } else {
      // Web fullscreen
      const container = document.querySelector('.player-container');
      if (container) {
        if (!document.fullscreenElement) {
          container.requestFullscreen?.();
          setIsFullscreen(true);
        } else {
          document.exitFullscreen?.();
          setIsFullscreen(false);
        }
      }
    }
  };

  const togglePlayPause = async () => {
    if (Platform.OS === 'web') {
      // Handled by WebVideoPlayer
      return;
    }
    
    try {
      if (videoRef.current) {
        if (isPlaying) {
          await videoRef.current.pauseAsync();
        } else {
          await videoRef.current.playAsync();
        }
      }
    } catch (err) {
      console.error('Play/pause error:', err);
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
          url={url}
          onError={handleError}
          onLoad={handleLoad}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        />
      );
    }

    // Native video player
    return Video ? (
      <Video
        ref={videoRef}
        source={{ uri: url }}
        style={styles.video}
        resizeMode={ResizeMode?.CONTAIN || 'contain'}
        shouldPlay={true}
        isLooping={false}
        onPlaybackStatusUpdate={handleNativePlaybackStatusUpdate}
        onError={(e: any) => handleError(e)}
        useNativeControls={false}
      />
    ) : null;
  };

  return (
    <View style={[styles.container, { backgroundColor: '#000000' }]} className="player-container">
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
              }}
            >
              <Text style={styles.retryText}>Försök igen</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      {showControls && (
        <View style={styles.controlsOverlay}>
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

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  webVideoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  webPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webPlayButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
