import { useCallback, ReactNode, forwardRef } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { cn } from '@/lib/utils';

interface VirtualizedGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string | number;
  className?: string;
  emptyMessage?: string;
}

// VirtuosoGrid requires forwardRef components
const ListComponent = forwardRef<HTMLDivElement, any>(({ style, children, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    style={style}
    className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
  >
    {children}
  </div>
));
ListComponent.displayName = 'GridList';

const ItemComponent = forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
  <div ref={ref} {...props}>
    {children}
  </div>
));
ItemComponent.displayName = 'GridItem';

const gridComponents = {
  List: ListComponent,
  Item: ItemComponent,
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
