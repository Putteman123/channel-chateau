import { cn } from '@/lib/utils';

interface StreamifyLogoProps {
  className?: string;
  collapsed?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StreamifyLogo({ className, collapsed = false, size = 'md' }: StreamifyLogoProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Logo Icon - Abstract Play Triangle with Digital Wave */}
      <div className={cn(
        'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-red-400 shadow-lg shadow-primary/30',
        sizeClasses[size]
      )}>
        {/* Play triangle */}
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-[60%] w-[60%]"
        >
          {/* Digital wave background lines */}
          <path
            d="M4 16C7 14 10 18 13 16C16 14 19 18 22 16C25 14 28 18 28 16"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-primary-foreground"
          />
          <path
            d="M4 20C7 18 10 22 13 20C16 18 19 22 22 20C25 18 28 22 28 20"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="1"
            strokeLinecap="round"
            className="text-primary-foreground"
          />
          {/* Main play triangle */}
          <path
            d="M11 8L11 24L25 16L11 8Z"
            fill="currentColor"
            className="text-primary-foreground"
          />
        </svg>
      </div>

      {/* Brand text */}
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
