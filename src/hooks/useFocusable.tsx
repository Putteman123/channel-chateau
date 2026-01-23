import { useEffect, useRef, useId } from 'react';
import { useSpatialNavigation } from '@/contexts/SpatialNavigationContext';

interface UseFocusableOptions {
  group?: string;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function useFocusable<T extends HTMLElement = HTMLElement>(options: UseFocusableOptions = {}) {
  const { group, disabled = false, onFocus, onBlur } = options;
  const ref = useRef<T>(null);
  const generatedId = useId();
  const { isTvMode, registerFocusable, unregisterFocusable, currentFocusId, focusElement } = useSpatialNavigation();

  const id = `focusable-${generatedId}`;

  useEffect(() => {
    if (!ref.current || disabled || !isTvMode) return;

    registerFocusable(id, ref.current, group);

    return () => {
      unregisterFocusable(id);
    };
  }, [id, group, disabled, isTvMode, registerFocusable, unregisterFocusable]);

  // Handle focus/blur callbacks
  useEffect(() => {
    if (currentFocusId === id) {
      onFocus?.();
    } else if (currentFocusId !== id) {
      onBlur?.();
    }
  }, [currentFocusId, id, onFocus, onBlur]);

  const focus = () => {
    if (!disabled && isTvMode) {
      focusElement(id);
    }
  };

  const isFocused = currentFocusId === id;

  return {
    ref,
    id,
    isFocused,
    focus,
    isTvMode,
  };
}
