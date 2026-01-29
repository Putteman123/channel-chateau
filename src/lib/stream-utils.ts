/**
 * Stream Utility Functions
 * Handles proxy URL generation and stream format conversion
 */

import { getProxyBaseUrl } from './proxy-config';

export interface ProxyOptions {
  userAgent?: string;
  referer?: string;
  preferM3u8?: boolean; // Try converting .ts to .m3u8
}

/**
 * Check if a URL ends with .ts (MPEG-TS format)
 */
export function isTsStream(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return pathname.endsWith('.ts');
  } catch {
    return url.includes('.ts');
  }
}

/**
 * Check if a URL is an M3U8/HLS stream
 */
export function isHlsStream(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return pathname.endsWith('.m3u8');
  } catch {
    return url.includes('.m3u8');
  }
}

/**
 * Convert .ts URL to .m3u8 URL (many IPTV providers support both)
 */
export function convertTsToM3u8(url: string): string {
  return url.replace(/\.ts(\?|$)/, '.m3u8$1');
}

/**
 * Generate a proxy URL for the stream (LEGACY)
 * NOTE: The new architecture uses Cloudflare Direct Tunnel instead.
 * This function is kept for backwards compatibility.
 * 
 * @see cloudflare-rewrite.ts for the new Direct Tunnel implementation
 */
export function getProxyUrl(originalUrl: string, options: ProxyOptions = {}): string {
  // Import the new tunnel function
  const CLOUDFLARE_VPN = 'https://vpn.premiumvinted.se';
  
  // Extract path from original URL
  try {
    const urlObj = new URL(originalUrl);
    let path = urlObj.pathname + urlObj.search;
    
    // Convert .ts to .m3u8 if requested (default for browser playback)
    if (options.preferM3u8) {
      path = path.replace(/\.ts(\?|$)/, '.m3u8$1');
    }
    
    const tunneledUrl = `${CLOUDFLARE_VPN}${path}`;
    console.log('[stream-utils] Using Cloudflare tunnel:', tunneledUrl.substring(0, 60) + '...');
    return tunneledUrl;
  } catch {
    // Fallback to edge function if URL parsing fails
    const proxyBase = getProxyBaseUrl();
    if (!proxyBase) {
      console.warn('[stream-utils] No proxy URL configured, returning original');
      return originalUrl;
    }
    
    const params = new URLSearchParams();
    params.set('url', originalUrl);
    if (options.userAgent) params.set('userAgent', options.userAgent);
    if (options.referer) params.set('referer', options.referer);
    
    return `${proxyBase}?${params.toString()}`;
  }
}

/**
 * Check if we're on an HTTPS page trying to load HTTP content (Mixed Content)
 */
export function hasMixedContentIssue(url: string): boolean {
  if (typeof window === 'undefined') return false;
  return url.startsWith('http://') && window.location.protocol === 'https:';
}

/**
 * Check if URL is already proxied/tunneled
 * Returns true if URL is using Cloudflare tunnel OR legacy Supabase proxy
 */
export function isProxiedUrl(url: string): boolean {
  // Cloudflare Direct Tunnel (new method)
  const CLOUDFLARE_VPN = 'https://vpn.premiumvinted.se';
  if (url.startsWith(CLOUDFLARE_VPN)) return true;
  
  // Legacy Supabase proxy with url parameter
  const hasProxyPath = url.includes('/functions/v1/stream-proxy');
  const hasUrlParam = url.includes('?url=');
  if (hasProxyPath && hasUrlParam) return true;
  
  // Custom domain with url parameter (legacy)
  const customDomain = 'line.premiumvinted.se';
  if (url.includes(customDomain) && hasUrlParam) return true;
  
  return false;
}

/**
 * Generate a proxy URL for images to bypass Mixed Content issues
 */
export function getImageProxyUrl(imageUrl: string | undefined | null): string {
  if (!imageUrl) return '';
  
  // Don't proxy if already HTTPS or local
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('/') || imageUrl.startsWith('data:')) {
    return imageUrl;
  }
  
  // Don't proxy if already proxied
  if (isProxiedUrl(imageUrl)) {
    return imageUrl;
  }
  
  // Check if we need to proxy (HTTP on HTTPS page)
  if (!hasMixedContentIssue(imageUrl)) {
    return imageUrl;
  }
  
  const proxyBase = getProxyBaseUrl();
  return `${proxyBase}?url=${encodeURIComponent(imageUrl)}`;
}

/**
 * Extract original URL from a proxied URL
 */
export function extractOriginalUrl(proxyUrl: string): string | null {
  if (!isProxiedUrl(proxyUrl)) return null;
  try {
    const url = new URL(proxyUrl);
    const originalUrl = url.searchParams.get('url');
    return originalUrl ? decodeURIComponent(originalUrl) : null;
  } catch {
    return null;
  }
}

/**
 * Build external player URL (VLC, MPV, IINA)
 */
export function buildExternalPlayerUrl(streamUrl: string, player: 'vlc' | 'mpv' | 'iina'): string {
  // Always use the original stream URL for external players, not the proxy
  const originalUrl = isProxiedUrl(streamUrl) 
    ? (extractOriginalUrl(streamUrl) || streamUrl)
    : streamUrl;

  switch (player) {
    case 'vlc':
      return `vlc://${originalUrl}`;
    case 'mpv':
      return `mpv://${originalUrl}`;
    case 'iina':
      return `iina://weblink?url=${encodeURIComponent(originalUrl)}`;
    default:
      return originalUrl;
  }
}

/**
 * Determine the best playback strategy for a stream URL
 */
export interface PlaybackStrategy {
  url: string;
  isProxied: boolean;
  isTsFormat: boolean;
  requiresExternalPlayer: boolean;
  originalUrl: string;
}

export function getPlaybackStrategy(
  originalUrl: string, 
  options: { 
    useProxy?: boolean; 
    preferM3u8?: boolean;
    userAgent?: string;
    referer?: string;
  } = {}
): PlaybackStrategy {
  const { useProxy = true, preferM3u8 = true, userAgent, referer } = options;
  
  const needsProxy = hasMixedContentIssue(originalUrl);
  const isTsFormat = isTsStream(originalUrl);
  
  // If we need a proxy and it's enabled
  if (needsProxy && useProxy) {
    const proxyUrl = getProxyUrl(originalUrl, { 
      preferM3u8: preferM3u8 && isTsFormat,
      userAgent,
      referer,
    });
    
    return {
      url: proxyUrl,
      isProxied: true,
      isTsFormat: !preferM3u8 && isTsFormat, // If we converted to m3u8, it's no longer ts
      requiresExternalPlayer: false,
      originalUrl,
    };
  }
  
  // If it's a .ts file and we can't proxy, it may need external player
  if (isTsFormat && needsProxy && !useProxy) {
    return {
      url: originalUrl,
      isProxied: false,
      isTsFormat: true,
      requiresExternalPlayer: true,
      originalUrl,
    };
  }
  
  // Direct playback
  return {
    url: originalUrl,
    isProxied: false,
    isTsFormat,
    requiresExternalPlayer: false,
    originalUrl,
  };
}
