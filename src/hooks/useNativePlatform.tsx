import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export interface NativePlatformInfo {
  isNative: boolean;
  platform: 'ios' | 'android' | 'web';
  useNativePlayer: boolean;
}

function safeGetPlatformInfo(): { isNative: boolean; platform: 'ios' | 'android' | 'web' } {
  try {
    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    return { isNative, platform };
  } catch (e) {
    console.warn('[useNativePlatform] Capacitor bridge not ready:', e);
    return { isNative: false, platform: 'web' };
  }
}

export function useNativePlatform(): NativePlatformInfo {
  const [platformInfo, setPlatformInfo] = useState<NativePlatformInfo>(() => {
    const { isNative, platform } = safeGetPlatformInfo();
    return { isNative, platform, useNativePlayer: isNative };
  });

  useEffect(() => {
    const { isNative, platform } = safeGetPlatformInfo();
    setPlatformInfo({ isNative, platform, useNativePlayer: isNative });
    console.log('[useNativePlatform]', { isNative, platform });
  }, []);

  return platformInfo;
}

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getPlatformName(): 'ios' | 'android' | 'web' {
  try {
    return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  } catch {
    return 'web';
  }
}
