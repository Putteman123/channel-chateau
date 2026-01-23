import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface FocusableElement {
  id: string;
  element: HTMLElement;
  group?: string;
}

interface SpatialNavigationContextType {
  isTvMode: boolean;
  setTvMode: (enabled: boolean) => void;
  currentFocusId: string | null;
  registerFocusable: (id: string, element: HTMLElement, group?: string) => void;
  unregisterFocusable: (id: string) => void;
  focusElement: (id: string) => void;
  focusDirection: (direction: 'up' | 'down' | 'left' | 'right') => void;
}

const SpatialNavigationContext = createContext<SpatialNavigationContextType | undefined>(undefined);

// Debounce helper
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timeoutId: NodeJS.Timeout | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function SpatialNavigationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [isTvMode, setIsTvMode] = useState(false);
  const [currentFocusId, setCurrentFocusId] = useState<string | null>(null);
  const focusablesRef = useRef<Map<string, FocusableElement>>(new Map());
  const hasUsedArrowKeys = useRef(false);

  // Check if TV mode from profile or arrow key usage
  useEffect(() => {
    const preferredDevice = (profile as any)?.preferred_device;
    if (preferredDevice === 'tv') {
      setIsTvMode(true);
    }
  }, [profile]);

  const setTvMode = useCallback((enabled: boolean) => {
    setIsTvMode(enabled);
  }, []);

  const registerFocusable = useCallback((id: string, element: HTMLElement, group?: string) => {
    focusablesRef.current.set(id, { id, element, group });
    element.setAttribute('data-nav-id', id);
    element.classList.add('focusable');
    if (group) element.setAttribute('data-nav-group', group);
  }, []);

  const unregisterFocusable = useCallback((id: string) => {
    const item = focusablesRef.current.get(id);
    if (item) {
      item.element.classList.remove('focusable', 'is-focused');
      item.element.removeAttribute('data-nav-id');
      item.element.removeAttribute('data-nav-group');
    }
    focusablesRef.current.delete(id);
    
    // If we removed the currently focused element, clear focus
    if (currentFocusId === id) {
      setCurrentFocusId(null);
    }
  }, [currentFocusId]);

  const focusElement = useCallback((id: string) => {
    // Remove focus from previous element
    if (currentFocusId) {
      const prevItem = focusablesRef.current.get(currentFocusId);
      if (prevItem) {
        prevItem.element.classList.remove('is-focused');
      }
    }

    // Add focus to new element
    const item = focusablesRef.current.get(id);
    if (item) {
      item.element.classList.add('is-focused');
      setCurrentFocusId(id);

      // Smooth scroll to center the element
      item.element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    }
  }, [currentFocusId]);

  const focusDirection = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const focusables = Array.from(focusablesRef.current.values());
    if (focusables.length === 0) return;

    // If no current focus, focus the first element
    if (!currentFocusId) {
      const first = focusables[0];
      if (first) focusElement(first.id);
      return;
    }

    const currentItem = focusablesRef.current.get(currentFocusId);
    if (!currentItem) return;

    const currentRect = currentItem.element.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;

    let candidates: { item: FocusableElement; distance: number; alignment: number }[] = [];

    for (const item of focusables) {
      if (item.id === currentFocusId) continue;

      const rect = item.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = centerX - currentCenterX;
      const dy = centerY - currentCenterY;

      let isInDirection = false;
      let primaryDistance = 0;
      let alignment = 0;

      switch (direction) {
        case 'up':
          isInDirection = dy < -10;
          primaryDistance = Math.abs(dy);
          alignment = Math.abs(dx);
          break;
        case 'down':
          isInDirection = dy > 10;
          primaryDistance = Math.abs(dy);
          alignment = Math.abs(dx);
          break;
        case 'left':
          isInDirection = dx < -10;
          primaryDistance = Math.abs(dx);
          alignment = Math.abs(dy);
          break;
        case 'right':
          isInDirection = dx > 10;
          primaryDistance = Math.abs(dx);
          alignment = Math.abs(dy);
          break;
      }

      if (isInDirection) {
        // Weight: prioritize alignment over distance
        const distance = primaryDistance + alignment * 2;
        candidates.push({ item, distance, alignment });
      }
    }

    // Sort by distance (closest first)
    candidates.sort((a, b) => a.distance - b.distance);

    if (candidates.length > 0) {
      focusElement(candidates[0].item.id);
    }
  }, [currentFocusId, focusElement]);

  // Debounced direction handler
  const debouncedFocusDirection = useCallback(
    debounce((direction: 'up' | 'down' | 'left' | 'right') => {
      focusDirection(direction);
    }, 100),
    [focusDirection]
  );

  // Global keyboard event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Activate TV mode on first arrow key press
      if (!hasUsedArrowKeys.current && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        hasUsedArrowKeys.current = true;
        setIsTvMode(true);
      }

      // Only handle navigation in TV mode
      if (!isTvMode) return;

      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          debouncedFocusDirection('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          debouncedFocusDirection('down');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          debouncedFocusDirection('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          debouncedFocusDirection('right');
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (currentFocusId) {
            const item = focusablesRef.current.get(currentFocusId);
            if (item) {
              item.element.click();
            }
          }
          break;
        case 'Escape':
        case 'Backspace':
          // Let the app handle back navigation
          window.dispatchEvent(new CustomEvent('spatial-back'));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTvMode, currentFocusId, debouncedFocusDirection]);

  return (
    <SpatialNavigationContext.Provider
      value={{
        isTvMode,
        setTvMode,
        currentFocusId,
        registerFocusable,
        unregisterFocusable,
        focusElement,
        focusDirection,
      }}
    >
      {children}
    </SpatialNavigationContext.Provider>
  );
}

export function useSpatialNavigation() {
  const context = useContext(SpatialNavigationContext);
  if (context === undefined) {
    throw new Error('useSpatialNavigation must be used within a SpatialNavigationProvider');
  }
  return context;
}
