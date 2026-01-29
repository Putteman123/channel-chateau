import { useState, useEffect } from 'react';
import { Play, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HeroItem {
  id: string;
  title: string;
  description?: string;
  backdrop?: string;
  poster?: string;
  type: 'movie' | 'series';
  year?: string;
  rating?: number | string;
}

interface HeroBannerProps {
  items: HeroItem[];
  onPlay: (item: HeroItem) => void;
  onInfo?: (item: HeroItem) => void;
}

export function HeroBanner({ items, onPlay, onInfo }: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Auto-rotate items
  useEffect(() => {
    if (items.length <= 1) return;
    
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % items.length);
        setIsTransitioning(false);
      }, 300);
    }, 8000);

    return () => clearInterval(interval);
  }, [items.length]);

  const activeItem = items[activeIndex];
  if (!activeItem) return null;

  const bgImage = activeItem.backdrop || activeItem.poster;

  return (
    <section className="relative -mx-6 -mt-4 mb-8 h-[50vh] min-h-[400px] max-h-[600px] overflow-hidden lg:h-[60vh]">
      {/* Background Image */}
      <div
        className={cn(
          "absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500",
          isTransitioning ? "opacity-0" : "opacity-100"
        )}
        style={{
          backgroundImage: bgImage 
            ? `url(${bgImage})` 
            : 'linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--background)) 100%)',
        }}
      />

      {/* Gradient overlays for smooth fade */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

      {/* Content */}
      <div className="relative flex h-full flex-col justify-end px-6 pb-12 lg:px-12 lg:pb-16">
        <div className={cn(
          "max-w-2xl space-y-4 transition-all duration-500",
          isTransitioning ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
        )}>
          {/* Title */}
          <h1 className="text-3xl font-bold leading-tight text-foreground drop-shadow-lg md:text-4xl lg:text-5xl">
            {activeItem.title}
          </h1>

          {/* Metadata */}
          <div className="flex items-center gap-3 text-sm text-foreground/80">
            {activeItem.rating && Number(activeItem.rating) > 0 && (
              <span className="flex items-center gap-1 font-medium">
                ⭐ {Number(activeItem.rating).toFixed(1)}
              </span>
            )}
            {activeItem.year && (
              <span className="rounded bg-muted/60 px-2 py-0.5 backdrop-blur-sm">
                {activeItem.year}
              </span>
            )}
            <span className="rounded bg-primary/80 px-2 py-0.5 text-primary-foreground backdrop-blur-sm">
              {activeItem.type === 'movie' ? 'Film' : 'Serie'}
            </span>
          </div>

          {/* Description */}
          {activeItem.description && (
            <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-foreground/80 md:text-base">
              {activeItem.description}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => onPlay(activeItem)}
              className="gap-2 bg-foreground text-background hover:bg-foreground/90"
            >
              <Play className="h-5 w-5 fill-current" />
              Spela
            </Button>
            {onInfo && (
              <Button
                size="lg"
                variant="secondary"
                onClick={() => onInfo(activeItem)}
                className="gap-2 bg-secondary/80 backdrop-blur-sm hover:bg-secondary"
              >
                <Info className="h-5 w-5" />
                Mer info
              </Button>
            )}
          </div>
        </div>

        {/* Pagination dots */}
        {items.length > 1 && (
          <div className="absolute bottom-4 right-6 flex items-center gap-2 lg:right-12">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setIsTransitioning(true);
                  setTimeout(() => {
                    setActiveIndex(idx);
                    setIsTransitioning(false);
                  }, 300);
                }}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  idx === activeIndex 
                    ? "w-8 bg-primary" 
                    : "w-2 bg-foreground/40 hover:bg-foreground/60"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
