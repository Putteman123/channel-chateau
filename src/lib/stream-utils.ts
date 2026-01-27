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
 * Generate a proxy URL for the stream
 * This routes the stream through our Supabase Edge Function to handle CORS/Mixed Content
 */
export function getProxyUrl(originalUrl: string, options: ProxyOptions = {}): string {
  const proxyBase = getProxyBaseUrl();
  if (!proxyBase) {
    console.warn('[stream-utils] No proxy URL configured, cannot proxy');
    return originalUrl;
  }

  // If preferM3u8 is enabled and URL ends with .ts, try .m3u8 first
  let urlToProxy = originalUrl;
  if (options.preferM3u8 && isTsStream(originalUrl)) {
    urlToProxy = convertTsToM3u8(originalUrl);
    console.log('[stream-utils] Converting .ts to .m3u8:', urlToProxy);
  }

  // Build proxy URL with query parameters
  const params = new URLSearchParams();
  params.set('url', urlToProxy);

  if (options.userAgent) {
    params.set('userAgent', options.userAgent);
  }
  if (options.referer) {
    params.set('referer', options.referer);
  }

  const proxyUrl = `${proxyBase}?${params.toString()}`;

  // Debug logging
  console.log('[stream-utils] Original URL:', originalUrl);
  console.log('[stream-utils] Proxy URL:', proxyUrl);

  return proxyUrl;
}

/**
 * Check if we're on an HTTPS page trying to load HTTP content (Mixed Content)
 */
export function hasMixedContentIssue(url: string): boolean {
  if (typeof window === 'undefined') return false;
  return url.startsWith('http://') && window.location.protocol === 'https:';
}

/**
 * Check if URL is already proxied through our Edge Function
 * Returns true ONLY if URL has the correct proxy format with ?url= parameter
 */
export function isProxiedUrl(url: string): boolean {
  const hasProxyPath = url.includes('/functions/v1/stream-proxy');
  const hasUrlParam = url.includes('?url=');
  
  // Must have BOTH the proxy path AND the url parameter to be correctly proxied
  if (hasProxyPath && hasUrlParam) return true;
  
  // Custom domain with url parameter is also valid
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
