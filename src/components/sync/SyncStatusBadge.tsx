/**
 * Sync Status Badge
 * Small indicator showing cache status and last sync time
 */

import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SyncStatusBadgeProps {
  channelCount: number;
  vodCount: number;
  seriesCount: number;
  lastSync: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function SyncStatusBadge({
  channelCount,
  vodCount,
  seriesCount,
  lastSync,
  onRefresh,
  isRefreshing = false,
  className,
}: SyncStatusBadgeProps) {
  const hasCache = channelCount > 0 || vodCount > 0 || seriesCount > 0;
  const lastSyncText = lastSync
    ? formatDistanceToNow(new Date(lastSync), { addSuffix: true, locale: sv })
    : 'Aldrig';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs',
            className
          )}>
            {hasCache ? (
              <Cloud className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            
            <span className="text-muted-foreground">
              {hasCache ? 'Synkad' : 'Ej synkad'}
            </span>
            
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-full"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn(
                  'h-3 w-3',
                  isRefreshing && 'animate-spin'
                )} />
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <p><strong>Kanaler:</strong> {channelCount}</p>
            <p><strong>Filmer:</strong> {vodCount}</p>
            <p><strong>Serier:</strong> {seriesCount}</p>
            <p className="text-muted-foreground">Synkad {lastSyncText}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
