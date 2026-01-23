import { forwardRef, ReactNode, HTMLAttributes } from 'react';
import { useFocusable } from '@/hooks/useFocusable';
import { cn } from '@/lib/utils';

interface FocusableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  group?: string;
  disabled?: boolean;
  onFocusChange?: (isFocused: boolean) => void;
  as?: 'div' | 'button' | 'a';
}

export const Focusable = forwardRef<HTMLDivElement, FocusableProps>(
  ({ children, group, disabled, onFocusChange, className, as = 'div', ...props }, forwardedRef) => {
    const { ref, isFocused, isTvMode } = useFocusable<HTMLDivElement>({
      group,
      disabled,
      onFocus: () => onFocusChange?.(true),
      onBlur: () => onFocusChange?.(false),
    });

    const Component = as as any;

    return (
      <Component
        ref={(node: HTMLDivElement) => {
          // Handle both refs
          (ref as any).current = node;
          if (typeof forwardedRef === 'function') {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        }}
        className={cn(
          className,
          isTvMode && 'focusable',
          isTvMode && isFocused && 'is-focused'
        )}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Focusable.displayName = 'Focusable';
