import { Heart, Play, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTMDBMetadata } from '@/hooks/useTMDBMetadata';
import { useFocusable } from '@/hooks/useFocusable';
import { LazyImage } from './LazyImage';

interface PosterCardProps {
  id: string;
  title: string;
  poster?: string;
  type: 'channel' | 'movie' | 'series';
  rating?: number | string;
  year?: string;
  isFavorite?: boolean;
  progress?: number;
  onPlay?: () => void;
  onToggleFavorite?: () => void;
  enableTMDB?: boolean;
  navGroup?: string;
  variant?: 'poster' | 'landscape';
}

export function PosterCard({
  id,
  title,
  poster,
  type,
  rating,
  year,
  isFavorite = false,
  progress = 0,
  onPlay,
  onToggleFavorite,
  enableTMDB = true,
  navGroup = 'content',
  variant = 'poster',
}: PosterCardProps) {
  const navigate = useNavigate();
  
  // Spatial navigation support
  const { ref, isFocused, isTvMode } = useFocusable<HTMLDivElement>({
    group: navGroup,
  });

  // Fetch TMDB metadata for movies and series
  const tmdbType = type === 'series' ? 'tv' : 'movie';
  const shouldFetchTMDB = enableTMDB && type !== 'channel';
  const { data: tmdbData } = useTMDBMetadata({
    title,
    type: tmdbType,
    enabled: shouldFetchTMDB,
  });

  // Use TMDB data as fallback when Xtream data is missing or low quality
  const displayPoster = (tmdbData?.poster && !poster) ? tmdbData.poster : poster;
  const displayRating = rating || tmdbData?.rating;
  const displayYear = year || tmdbData?.year;

  const handleClick = () => {
    if (onPlay) {
      onPlay();
    } else {
      navigate(`/${type}/${id}`);
    }
  };

  return (
    <div 
      ref={ref}
      onClick={handleClick}
      className={cn(
        "group relative shrink-0 cursor-pointer transition-all duration-300",
        variant === 'poster' 
          ? "w-[140px] sm:w-[160px] lg:w-[180px]" 
          : "w-[240px] sm:w-[280px] lg:w-[320px]",
        isTvMode && "focusable",
        isTvMode && isFocused && "is-focused"
      )}
      role="button"
      tabIndex={isTvMode ? -1 : 0}
    >
      {/* Poster Image Container */}
      <div className={cn(
        "relative overflow-hidden rounded-lg shadow-lg transition-all duration-300",
        "group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-primary/20",
        variant === 'poster' ? "aspect-[2/3]" : "aspect-video"
      )}>
        <LazyImage
          src={displayPoster}
          alt={title}
          aspectRatio={variant === 'poster' ? 'poster' : 'video'}
          className="transition-transform duration-500 group-hover:scale-110"
        />

        {/* Hover overlay */}
        <div className={cn(
          "absolute inset-0 flex flex-col items-center justify-center bg-black/60 transition-opacity duration-300",
          isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          {/* Play button */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg transition-transform group-hover:scale-110">
            <Play className="h-5 w-5 fill-primary-foreground text-primary-foreground" />
          </div>
        </div>

        {/* Favorite button */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={cn(
              "absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-all",
              "hover:bg-black/80",
              isFocused || isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            <Heart className={cn(
              'h-4 w-4 transition-colors',
              isFavorite ? 'fill-primary text-primary' : 'text-white'
            )} />
          </button>
        )}

        {/* Progress bar for continue watching */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/60">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Live indicator for channels */}
        {type === 'channel' && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </div>
        )}

        {/* Rating badge */}
        {displayRating && Number(displayRating) > 0 && type !== 'channel' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {Number(displayRating).toFixed(1)}
          </div>
        )}
      </div>

      {/* Title and metadata */}
      <div className="mt-2 space-y-0.5">
        <h3 className="line-clamp-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        {displayYear && (
          <p className="text-xs text-muted-foreground">{displayYear}</p>
        )}
      </div>
    </div>
  );
}
