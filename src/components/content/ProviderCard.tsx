import { cn } from '@/lib/utils';
import { useFocusable } from '@/hooks/useFocusable';
import { LazyImage } from './LazyImage';
import { getSubscriptionInfo, getStatusStyles } from '@/lib/subscription-utils';
import { AlertTriangle } from 'lucide-react';

interface ProviderCardProps {
  name: string;
  icon?: string;
  isSelected: boolean;
  onClick: () => void;
  count?: number;
  expiresAt?: string | null;
}

// Provider brand colors mapping with more vibrant gradients
const providerColors: Record<string, { gradient: string; glow: string }> = {
  netflix: { 
    gradient: 'from-red-600 via-red-700 to-red-900', 
    glow: 'shadow-red-600/40' 
  },
  hbo: { 
    gradient: 'from-purple-600 via-purple-700 to-purple-900', 
    glow: 'shadow-purple-600/40' 
  },
  max: { 
    gradient: 'from-blue-600 via-indigo-700 to-purple-900', 
    glow: 'shadow-blue-600/40' 
  },
  disney: { 
    gradient: 'from-blue-500 via-blue-600 to-blue-800', 
    glow: 'shadow-blue-500/40' 
  },
  amazon: { 
    gradient: 'from-cyan-500 via-cyan-600 to-cyan-800', 
    glow: 'shadow-cyan-500/40' 
  },
  prime: { 
    gradient: 'from-cyan-400 via-blue-500 to-blue-700', 
    glow: 'shadow-cyan-400/40' 
  },
  apple: { 
    gradient: 'from-gray-600 via-gray-700 to-gray-900', 
    glow: 'shadow-gray-600/40' 
  },
  hulu: { 
    gradient: 'from-green-400 via-green-500 to-green-700', 
    glow: 'shadow-green-400/40' 
  },
  paramount: { 
    gradient: 'from-blue-500 via-blue-600 to-blue-800', 
    glow: 'shadow-blue-500/40' 
  },
  peacock: { 
    gradient: 'from-yellow-400 via-orange-500 to-orange-700', 
    glow: 'shadow-yellow-400/40' 
  },
  crunchyroll: { 
    gradient: 'from-orange-400 via-orange-500 to-orange-700', 
    glow: 'shadow-orange-400/40' 
  },
  showtime: { 
    gradient: 'from-red-600 via-red-700 to-red-900', 
    glow: 'shadow-red-600/40' 
  },
  starz: { 
    gradient: 'from-gray-700 via-gray-800 to-gray-950', 
    glow: 'shadow-gray-700/40' 
  },
  mubi: { 
    gradient: 'from-gray-600 via-gray-700 to-gray-900', 
    glow: 'shadow-gray-600/40' 
  },
  criterion: { 
    gradient: 'from-amber-500 via-amber-600 to-amber-800', 
    glow: 'shadow-amber-500/40' 
  },
  viaplay: { 
    gradient: 'from-pink-500 via-pink-600 to-purple-700', 
    glow: 'shadow-pink-500/40' 
  },
};

// Get initials from provider name
function getInitials(name: string): string {
  const words = name.split(/[\s+]/);
  if (words.length === 1) {
    return name.slice(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// Get styles for provider
function getProviderStyles(name: string): { gradient: string; glow: string } {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(providerColors)) {
    if (lowerName.includes(key)) {
      return value;
    }
  }
  // Default gradient
  return { 
    gradient: 'from-primary via-primary/90 to-primary/70', 
    glow: 'shadow-primary/30' 
  };
}

export function ProviderCard({
  name,
  icon,
  isSelected,
  onClick,
  count,
  expiresAt,
}: ProviderCardProps) {
  const styles = getProviderStyles(name);
  const initials = getInitials(name);
  const subscriptionInfo = getSubscriptionInfo(expiresAt ?? null);
  const isExpired = subscriptionInfo.status === 'expired';
  
  // Spatial navigation support
  const { ref, isFocused, isTvMode } = useFocusable<HTMLButtonElement>({
    group: 'providers',
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-center gap-3 rounded-2xl p-4 transition-all duration-300',
        'hover:scale-105 active:scale-95',
        isSelected || isFocused
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg'
          : 'hover:shadow-md',
        isTvMode && 'focusable',
        isTvMode && isFocused && 'is-focused',
        isExpired && 'opacity-60'
      )}
    >
      {/* Provider Icon/Logo with glow effect */}
      <div
        className={cn(
          'relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg transition-all duration-300',
          styles.gradient,
          (isSelected || isFocused) && cn('scale-110 shadow-xl', styles.glow),
          isExpired && 'grayscale'
        )}
      >
        {/* Shine effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 via-transparent to-transparent" />
        
        {icon ? (
          <LazyImage
            src={icon}
            alt={name}
            aspectRatio="square"
            className="h-12 w-12 rounded-lg object-contain"
            blurPlaceholder={false}
          />
        ) : (
          <span className="relative text-2xl font-bold text-white drop-shadow-md">
            {initials}
          </span>
        )}
      </div>

      {/* Provider Name */}
      <span className={cn(
        'max-w-[80px] truncate text-xs font-medium transition-colors',
        isSelected || isFocused ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
      )}>
        {name}
      </span>

      {/* Subscription Status (small text under name) */}
      {expiresAt && (
        <span className={cn(
          'text-[10px]',
          getStatusStyles(subscriptionInfo.status).textClass
        )}>
          {subscriptionInfo.statusText}
        </span>
      )}

      {/* Content Count Badge with animation */}
      {count !== undefined && count > 0 && (
        <span className={cn(
          'absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-bold transition-all',
          'bg-primary text-primary-foreground shadow-md',
          (isSelected || isFocused) && 'scale-110'
        )}>
          {count > 999 ? '999+' : count}
        </span>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -bottom-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-primary" />
      )}

      {/* Expired warning icon */}
      {isExpired && (
        <div className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md">
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
      )}
    </button>
  );
}
