import { useMemo, useCallback, ReactNode } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { cn } from '@/lib/utils';

interface VirtualizedGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string | number;
  className?: string;
  emptyMessage?: string;
  columns?: {
    default: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
}

// Responsive grid container that matches Tailwind breakpoints
const gridComponents = {
  List: ({ style, children, ...props }: any) => (
    <div
      {...props}
      style={{
        ...style,
        display: 'grid',
        gap: '1rem',
      }}
      className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {children}
    </div>
  ),
  Item: ({ children, ...props }: any) => (
    <div {...props}>
      {children}
    </div>
  ),
};

export function VirtualizedGrid<T>({
  items,
  renderItem,
  keyExtractor,
  className,
  emptyMessage = 'Inget innehåll att visa',
}: VirtualizedGridProps<T>) {
  const itemContent = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return null;
      return renderItem(item, index);
    },
    [items, renderItem]
  );

  const computeItemKey = useCallback(
    (index: number) => {
      const item = items[index];
      return item ? String(keyExtractor(item)) : `item-${index}`;
    },
    [items, keyExtractor]
  );

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <VirtuosoGrid
      useWindowScroll
      totalCount={items.length}
      components={gridComponents}
      itemContent={itemContent}
      computeItemKey={computeItemKey}
      className={cn('min-h-[400px]', className)}
      overscan={200}
    />
  );
}
