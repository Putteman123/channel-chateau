import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export interface NativePlatformInfo {
  isNative: boolean;
  platform: 'ios' | 'android' | 'web';
  useNativePlayer: boolean;
}

/**
 * Detect if running inside a native Android/iOS WebView.
 * Capacitor bridge may not fully initialize when using a remote server.url,
 * so we also check the User-Agent as a fallback.
 */
function isAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Android WebView typically contains "wv" or "Version/X.X Chrome/X" pattern
  return /Android/.test(ua) && (/wv\)/.test(ua) || /; wv/.test(ua));
}

function isIOSWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iOS standalone WebView (not Safari)
  return /iPhone|iPad|iPod/.test(ua) && !/Safari/.test(ua);
}

function safeGetPlatformInfo(): { isNative: boolean; platform: 'ios' | 'android' | 'web' } {
  try {
    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    if (isNative) return { isNative, platform };
  } catch (e) {
    console.warn('[useNativePlatform] Capacitor bridge not ready:', e);
  }
  
  // Fallback: detect native WebView via User-Agent (for remote server.url mode)
  if (isAndroidWebView()) {
    console.log('[useNativePlatform] Detected Android WebView via UA fallback');
    return { isNative: true, platform: 'android' };
  }
  if (isIOSWebView()) {
    console.log('[useNativePlatform] Detected iOS WebView via UA fallback');
    return { isNative: true, platform: 'ios' };
  }
  
  return { isNative: false, platform: 'web' };
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
