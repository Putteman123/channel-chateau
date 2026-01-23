import { useEffect, useRef, useCallback } from 'react';
import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  // Determine source type
  const getSourceType = useCallback((url: string) => {
    if (url.includes('.m3u8')) return 'application/x-mpegURL';
    if (url.includes('.mp4')) return 'video/mp4';
    if (url.includes('.webm')) return 'video/webm';
    return 'application/x-mpegURL'; // Default to HLS
  }, []);

  // Initialize player
  useEffect(() => {
    if (!videoRef.current || !src) return;

    // Create video element if not exists
    if (!playerRef.current) {
      const videoElement = document.createElement('video-js');
      videoElement.classList.add('vjs-big-play-centered', 'vjs-theme-city');
      videoRef.current.appendChild(videoElement);

      const player = videojs(videoElement, {
        autoplay: autoPlay,
        controls: true,
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
      });

      // Handle ended event
      player.on('ended', () => {
        onEnded?.();
      });
    } else {
      // Update source if it changes
      const player = playerRef.current;
      player.src({ src, type: getSourceType(src) });
      if (poster) {
        player.poster(poster);
      }
    }
  }, [src, poster, autoPlay, startPosition, getSourceType, onEnded]);

  // Progress tracking
  useEffect(() => {
    if (onProgress && playerRef.current) {
      progressIntervalRef.current = setInterval(() => {
        const player = playerRef.current;
        if (player) {
          const currentTime = player.currentTime() || 0;
          const duration = player.duration() || 0;
          if (duration > 0) {
            onProgress(currentTime, duration);
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
    };
  }, []);

  return (
    <div className="relative w-full">
      {/* Title overlay with close button */}
      {(title || onClose) && (
        <div className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
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

      {/* Video.js container */}
      <div 
        data-vjs-player 
        className="aspect-video w-full overflow-hidden rounded-xl shadow-2xl"
      >
        <div ref={videoRef} />
      </div>
    </div>
  );
}
