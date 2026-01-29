/**
 * Cloudflare Domain Rewrite Utility
 * 
 * Routes streams through our Supabase Edge Function proxy.
 * The proxy handles:
 * - Following redirects internally (MITM mode)
 * - Mixed Content issues (HTTP → HTTPS)
 * - Extensionless URLs (assumes MPEG-TS)
 * 
 * NOTE: We NO LONGER convert .ts to .m3u8 - the proxy sends URLs as-is.
 */

import { getProxyBaseUrl } from './proxy-config';

// The secure Cloudflare domain that proxies to IPTV providers
export const CLOUDFLARE_VPN_DOMAIN = 'https://vpn.premiumvinted.se';

// Known IPTV provider domains to replace
const PROVIDER_DOMAINS = [
  'http://line.myox.me',
  'http://line.premiumvinted.se',
];

/**
 * Check if URL is using the Cloudflare VPN domain
 */
export function isCloudflareUrl(url: string): boolean {
  return url.startsWith(CLOUDFLARE_VPN_DOMAIN) || 
         url.includes('/functions/v1/stream-proxy');
}

/**
 * Rewrite a stream URL to use the Supabase Edge Function proxy
 * This ensures redirects are followed server-side (MITM mode)
 * 
 * @param url - The original stream URL
 * @returns Proxied URL that goes through our Edge Function
 */
export function rewriteToProxy(url: string): string {
  if (!url) return url;
  
  // Already using the proxy
  if (url.includes('/functions/v1/stream-proxy')) {
    return url;
  }
  
  // Get the proxy base URL
  const proxyBase = getProxyBaseUrl();
  if (!proxyBase) {
    console.warn('[cloudflare-rewrite] No proxy URL configured');
    return url;
  }
  
  // Build proxy URL - send the EXACT URL, no transformations
  const proxyUrl = `${proxyBase}?url=${encodeURIComponent(url)}`;
  console.log('[cloudflare-rewrite] Proxying:', url.substring(0, 60) + '...');
  console.log('[cloudflare-rewrite] Via:', proxyUrl.substring(0, 80) + '...');
  
  return proxyUrl;
}

/**
 * Legacy function - now just calls rewriteToProxy
 * @deprecated Use rewriteToProxy instead
 */
export function rewriteToCloudflare(url: string): string {
  return rewriteToProxy(url);
}

/**
 * Full transformation: route through proxy
 * NOTE: No longer converts .ts to .m3u8 - sends exact URL
 * 
 * @param url - The original stream URL  
 * @param _options - Deprecated options (preferM3u8 is ignored)
 */
export function transformStreamUrl(url: string, _options?: { preferM3u8?: boolean }): string {
  // Ignore preferM3u8 option - we no longer do format conversion
  // The proxy handles everything including redirects
  
  const transformed = rewriteToProxy(url);
  console.log('[cloudflare-rewrite] Final URL:', transformed.substring(0, 80) + '...');
  return transformed;
}

/**
 * Extract original URL from Cloudflare URL (for external player links)
 */
export function getOriginalProviderUrl(proxyUrl: string, originalDomain: string): string {
  // If it's a proxy URL with ?url= param, extract the original
  if (proxyUrl.includes('?url=')) {
    try {
      const url = new URL(proxyUrl);
      const original = url.searchParams.get('url');
      if (original) return decodeURIComponent(original);
    } catch {
      // Failed to parse, return as-is
    }
  }
  
  // Legacy: if using Cloudflare domain directly
  if (proxyUrl.startsWith(CLOUDFLARE_VPN_DOMAIN)) {
    return proxyUrl.replace(CLOUDFLARE_VPN_DOMAIN, originalDomain);
  }
  
  return proxyUrl;
}
