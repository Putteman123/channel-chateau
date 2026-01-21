import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ContentRowProps {
  title: string;
  children: React.ReactNode;
  viewAllLink?: string;
}

export function ContentRow({ title, children, viewAllLink }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

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
    <section className="relative py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        {viewAllLink && (
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Visa alla
          </Button>
        )}
      </div>

      <div className="group/row relative">
        {/* Left arrow */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute -left-4 top-1/2 z-10 h-20 w-10 -translate-y-1/2 rounded-r-lg bg-background/80 opacity-0 backdrop-blur-sm transition-opacity hover:bg-background/90 group-hover/row:opacity-100',
            !showLeftArrow && 'hidden'
          )}
          onClick={() => scroll('left')}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        {/* Content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {children}
        </div>

        {/* Right arrow */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute -right-4 top-1/2 z-10 h-20 w-10 -translate-y-1/2 rounded-l-lg bg-background/80 opacity-0 backdrop-blur-sm transition-opacity hover:bg-background/90 group-hover/row:opacity-100',
            !showRightArrow && 'hidden'
          )}
          onClick={() => scroll('right')}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>
    </section>
  );
}
