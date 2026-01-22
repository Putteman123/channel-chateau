import { Skeleton } from '@/components/ui/skeleton';

interface ContentSkeletonProps {
  count?: number;
  type?: 'card' | 'row' | 'channel';
}

export function ContentSkeleton({ count = 12, type = 'card' }: ContentSkeletonProps) {
  if (type === 'row') {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, rowIndex) => (
          <div key={rowIndex} className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-[150px] shrink-0 space-y-2">
                  <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'channel') {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
