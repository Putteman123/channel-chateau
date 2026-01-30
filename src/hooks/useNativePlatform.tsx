import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export interface NativePlatformInfo {
  /** Whether the app is running on a native platform (iOS/Android) */
  isNative: boolean;
  /** The platform name: 'ios', 'android', or 'web' */
  platform: 'ios' | 'android' | 'web';
  /** Whether native video player should be used */
  useNativePlayer: boolean;
}

/**
 * Hook to detect if the app is running on a native platform (Capacitor)
 * and provide platform-specific configuration.
 */
export function useNativePlatform(): NativePlatformInfo {
  const [platformInfo, setPlatformInfo] = useState<NativePlatformInfo>(() => {
    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    
    return {
      isNative,
      platform,
      useNativePlayer: isNative,
    };
  });

  useEffect(() => {
    // Re-check on mount (in case of SSR or delayed detection)
    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    
    setPlatformInfo({
      isNative,
      platform,
      useNativePlayer: isNative,
    });
    
    console.log('[useNativePlatform]', {
      isNative,
      platform,
      useNativePlayer: isNative,
    });
  }, []);

  return platformInfo;
}

/**
 * Utility function to check if running on native platform (synchronous)
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get the current platform name
 */
export function getPlatformName(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}
