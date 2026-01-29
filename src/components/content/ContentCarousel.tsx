import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ContentCarouselProps {
  title: string;
  children: React.ReactNode;
  viewAllLink?: string;
  variant?: 'poster' | 'landscape';
}

export function ContentCarousel({ 
  title, 
  children, 
  viewAllLink,
  variant = 'poster',
}: ContentCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 20);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 20);
    }
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section className="group/carousel relative py-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground lg:text-2xl">
          {title}
        </h2>
        {viewAllLink && (
          <Link 
            to={viewAllLink} 
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            Visa alla →
          </Link>
        )}
      </div>

      {/* Carousel container */}
      <div className="relative">
        {/* Left navigation arrow */}
        <button
          onClick={() => scroll('left')}
          className={cn(
            "absolute -left-2 top-1/2 z-20 flex h-full -translate-y-1/2 items-center justify-center px-2 transition-opacity lg:-left-4 lg:px-4",
            "bg-gradient-to-r from-background/95 to-transparent",
            showLeftArrow 
              ? "opacity-0 group-hover/carousel:opacity-100" 
              : "pointer-events-none opacity-0"
          )}
        >
          <div className="rounded-full bg-card/90 p-2 shadow-lg backdrop-blur-sm transition-transform hover:scale-110">
            <ChevronLeft className="h-6 w-6 text-foreground" />
          </div>
        </button>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            "flex gap-3 overflow-x-auto scroll-smooth pb-4 scrollbar-hide lg:gap-4",
            variant === 'poster' ? 'pr-12' : 'pr-8'
          )}
        >
          {children}
        </div>

        {/* Right navigation arrow */}
        <button
          onClick={() => scroll('right')}
          className={cn(
            "absolute -right-2 top-1/2 z-20 flex h-full -translate-y-1/2 items-center justify-center px-2 transition-opacity lg:-right-4 lg:px-4",
            "bg-gradient-to-l from-background/95 to-transparent",
            showRightArrow 
              ? "opacity-0 group-hover/carousel:opacity-100" 
              : "pointer-events-none opacity-0"
          )}
        >
          <div className="rounded-full bg-card/90 p-2 shadow-lg backdrop-blur-sm transition-transform hover:scale-110">
            <ChevronRight className="h-6 w-6 text-foreground" />
          </div>
        </button>
      </div>
    </section>
  );
}
