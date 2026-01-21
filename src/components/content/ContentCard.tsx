import { Heart, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ContentCardProps {
  id: string;
  title: string;
  poster?: string;
  type: 'channel' | 'movie' | 'series';
  rating?: number;
  year?: string;
  category?: string;
  isFavorite?: boolean;
  progress?: number;
  onPlay?: () => void;
  onToggleFavorite?: () => void;
}

export function ContentCard({
  id,
  title,
  poster,
  type,
  rating,
  year,
  category,
  isFavorite = false,
  progress = 0,
  onPlay,
  onToggleFavorite,
}: ContentCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onPlay) {
      onPlay();
    } else {
      // Navigate to detail page
      navigate(`/${type}/${id}`);
    }
  };

  return (
    <div className="group relative card-hover">
      {/* Poster */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted">
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder.svg';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <span className="text-4xl text-muted-foreground">📺</span>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Button
            size="lg"
            className="mb-2 h-14 w-14 rounded-full"
            onClick={handleClick}
          >
            <Play className="h-6 w-6" />
          </Button>
          
          {onToggleFavorite && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
            >
              <Heart
                className={cn('h-5 w-5', isFavorite && 'fill-primary text-primary')}
              />
            </Button>
          )}
        </div>

        {/* Progress bar for continue watching */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Live indicator for channels */}
        {type === 'channel' && (
          <div className="absolute left-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            LIVE
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-2 space-y-1">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {rating && rating > 0 && (
            <span className="flex items-center gap-1">
              ⭐ {rating.toFixed(1)}
            </span>
          )}
          {year && <span>{year}</span>}
          {category && <span>{category}</span>}
        </div>
      </div>
    </div>
  );
}
