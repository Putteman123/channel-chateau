import { cn } from '@/lib/utils';
import { useFocusable } from '@/hooks/useFocusable';

interface ProviderCardProps {
  name: string;
  icon?: string;
  isSelected: boolean;
  onClick: () => void;
  count?: number;
}

// Provider brand colors mapping
const providerColors: Record<string, string> = {
  netflix: 'from-red-600 to-red-800',
  hbo: 'from-purple-600 to-purple-900',
  disney: 'from-blue-500 to-blue-700',
  amazon: 'from-cyan-500 to-cyan-700',
  prime: 'from-cyan-500 to-cyan-700',
  apple: 'from-gray-700 to-gray-900',
  hulu: 'from-green-500 to-green-700',
  paramount: 'from-blue-600 to-blue-800',
  peacock: 'from-yellow-500 to-orange-600',
  max: 'from-blue-700 to-indigo-900',
  crunchyroll: 'from-orange-500 to-orange-700',
  showtime: 'from-red-700 to-red-900',
  starz: 'from-gray-800 to-gray-950',
  mubi: 'from-gray-700 to-gray-900',
  criterion: 'from-amber-600 to-amber-800',
};

// Get initials from provider name
function getInitials(name: string): string {
  const words = name.split(/[\s+]/);
  if (words.length === 1) {
    return name.slice(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// Get gradient class for provider
function getProviderGradient(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(providerColors)) {
    if (lowerName.includes(key)) {
      return value;
    }
  }
  // Default gradient
  return 'from-primary to-primary/80';
}

export function ProviderCard({
  name,
  icon,
  isSelected,
  onClick,
  count,
}: ProviderCardProps) {
  const gradient = getProviderGradient(name);
  const initials = getInitials(name);
  
  // Spatial navigation support
  const { ref, isFocused, isTvMode } = useFocusable<HTMLButtonElement>({
    group: 'providers',
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-center gap-2 rounded-xl p-4 transition-all duration-200',
        'hover:scale-105 hover:shadow-lg',
        isSelected
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
          : 'hover:ring-1 hover:ring-muted-foreground/30',
        isTvMode && 'focusable',
        isTvMode && isFocused && 'is-focused'
      )}
    >
      {/* Provider Icon/Logo */}
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br shadow-md transition-transform',
          gradient,
          (isSelected || isFocused) && 'scale-110'
        )}
      >
        {icon ? (
          <img
            src={icon}
            alt={name}
            className="h-10 w-10 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <span
          className={cn(
            'text-xl font-bold text-white',
            icon && 'hidden'
          )}
        >
          {initials}
        </span>
      </div>

      {/* Provider Name */}
      <span className={cn(
        'text-xs font-medium transition-colors',
        isSelected || isFocused ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
      )}>
        {name}
      </span>

      {/* Content Count Badge */}
      {count !== undefined && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
          {count > 999 ? '999+' : count}
        </span>
      )}
    </button>
  );
}
