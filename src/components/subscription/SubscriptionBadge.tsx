import { Clock, AlertTriangle, CheckCircle, Infinity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSubscriptionInfo, getStatusStyles } from '@/lib/subscription-utils';

interface SubscriptionBadgeProps {
  expiresAt: string | null;
  showDays?: boolean;
  compact?: boolean;
  className?: string;
}

export function SubscriptionBadge({
  expiresAt,
  showDays = true,
  compact = false,
  className,
}: SubscriptionBadgeProps) {
  const info = getSubscriptionInfo(expiresAt);
  const styles = getStatusStyles(info.status);

  const Icon = info.status === 'expired' 
    ? AlertTriangle 
    : info.status === 'expiring-soon'
    ? Clock
    : info.status === 'unlimited'
    ? Infinity
    : CheckCircle;

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
          styles.bgClass,
          styles.textClass,
          className
        )}
      >
        <Icon className="h-3 w-3" />
        {showDays ? info.statusText : info.formattedDate || info.statusText}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className={cn('flex items-center gap-1.5 text-sm', styles.textClass)}>
        <Icon className={cn('h-4 w-4', styles.iconClass)} />
        <span className="font-medium">{info.statusText}</span>
      </div>
      {info.formattedDate && info.status !== 'unlimited' && (
        <span className="text-xs text-muted-foreground">
          Giltig t.o.m: {info.formattedDate}
        </span>
      )}
    </div>
  );
}
