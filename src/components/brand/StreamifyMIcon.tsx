import { cn } from '@/lib/utils';

interface StreamifyMIconProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Streamify "M" Logo - Stylized M symbol with Netflix-inspired design
 * Represents "Mega" / "Media" - premium streaming branding
 */
export function StreamifyMIcon({ className, size = 'md' }: StreamifyMIconProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
    xl: 'h-24 w-24',
  };

  return (
    <div className={cn(
      'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-red-600 shadow-lg shadow-primary/40',
      sizeClasses[size],
      className
    )}>
      {/* Stylized M Icon */}
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-[70%] w-[70%]"
      >
        {/* Background glow effect */}
        <defs>
          <linearGradient id="mGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0.85" />
          </linearGradient>
          <filter id="mGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* The "M" - Netflix-style ribbons */}
        <g filter="url(#mGlow)">
          {/* Left vertical bar */}
          <path
            d="M8 10 L8 38 L14 38 L14 10 Z"
            fill="url(#mGradient)"
          />
          {/* Left diagonal */}
          <path
            d="M14 10 L24 28 L24 10 L14 10 Z"
            fill="url(#mGradient)"
            fillOpacity="0.95"
          />
          {/* Right diagonal */}
          <path
            d="M24 10 L24 28 L34 10 L24 10 Z"
            fill="url(#mGradient)"
            fillOpacity="0.95"
          />
          {/* Right vertical bar */}
          <path
            d="M34 10 L34 38 L40 38 L40 10 Z"
            fill="url(#mGradient)"
          />
          {/* Bottom left extension for depth */}
          <path
            d="M14 26 L14 38 L18 38 L24 26 Z"
            fill="url(#mGradient)"
            fillOpacity="0.9"
          />
          {/* Bottom right extension for depth */}
          <path
            d="M24 26 L30 38 L34 38 L34 26 Z"
            fill="url(#mGradient)"
            fillOpacity="0.9"
          />
        </g>
      </svg>
    </div>
  );
}

interface StreamifyFullLogoProps {
  className?: string;
  collapsed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

/**
 * Full Streamify Logo with M icon and text
 */
export function StreamifyFullLogo({ 
  className, 
  collapsed = false, 
  size = 'md',
  showIcon = true 
}: StreamifyFullLogoProps) {
  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const iconSizes: Record<string, 'sm' | 'md' | 'lg'> = {
    sm: 'sm',
    md: 'md',
    lg: 'lg',
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {showIcon && <StreamifyMIcon size={iconSizes[size]} />}
      
      {!collapsed && (
        <span className={cn(
          'font-bold tracking-tight text-foreground',
          textSizes[size]
        )}>
          <span className="text-primary">Stream</span>ify
        </span>
      )}
    </div>
  );
}
