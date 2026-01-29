/**
 * Cloudflare Direct Tunneling Utility (IPTV Smarters Method)
 * 
 * Routes streams through our Cloudflare-proxied domain for SSL tunneling.
 * This bypasses Mixed Content blocks by converting HTTP streams to HTTPS.
 * 
 * The Cloudflare domain (vpn.premiumvinted.se) proxies directly to the
 * IPTV provider's IP address, making HTTP streams accessible via HTTPS.
 * 
 * This is FASTER than the Supabase Edge Function proxy because:
 * - Cloudflare's edge network is closer to both users and providers
 * - No serverless cold starts or function overhead
 * - Native HTTP/2 and connection pooling
 */

// The secure Cloudflare VPN domain that proxies to IPTV providers
export const CLOUDFLARE_VPN_DOMAIN = 'https://vpn.premiumvinted.se';

// Known IPTV provider domains to rewrite
const PROVIDER_DOMAINS = [
  'http://line.myox.me',
  'http://line.premiumvinted.se',
  // IP addresses are also supported via path extraction
];

// Cache for domain availability
let tunnelAvailable: boolean | null = null;
let testInProgress: Promise<boolean> | null = null;

/**
 * Test if the Cloudflare tunnel domain is reachable
 */
export async function testTunnelAvailability(): Promise<boolean> {
  if (tunnelAvailable !== null) return tunnelAvailable;
  if (testInProgress) return testInProgress;
  
  testInProgress = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${CLOUDFLARE_VPN_DOMAIN}/`, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'cors',
      });
      clearTimeout(timeout);
      
      // Any response means the tunnel is up
      tunnelAvailable = response.ok || response.status < 500;
      console.log(`[cloudflare-tunnel] Tunnel test: ${tunnelAvailable ? '✅ AVAILABLE' : '❌ UNAVAILABLE'}`);
      return tunnelAvailable;
    } catch (err) {
      console.warn('[cloudflare-tunnel] Tunnel unavailable:', err instanceof Error ? err.message : err);
      tunnelAvailable = false;
      return false;
    } finally {
      testInProgress = null;
    }
  })();
  
  return testInProgress;
}

/**
 * Reset tunnel availability cache
 */
export function resetTunnelCache(): void {
  tunnelAvailable = null;
  testInProgress = null;
  console.log('[cloudflare-tunnel] Cache reset');
}

/**
 * Check if URL is using the Cloudflare VPN tunnel
 */
export function isCloudflareUrl(url: string): boolean {
  return url.startsWith(CLOUDFLARE_VPN_DOMAIN);
}

/**
 * Check if URL is using the old Supabase proxy format
 */
export function isSupabaseProxyUrl(url: string): boolean {
  return url.includes('/functions/v1/stream-proxy');
}

/**
 * Extract the path from a URL (everything after the domain)
 * 
 * Examples:
 * - http://line.myox.me/live/user/pass/123.ts → /live/user/pass/123.ts
 * - http://185.245.1.2:8080/live/user/pass/123.ts → /live/user/pass/123.ts
 */
function extractPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
  } catch {
    // Fallback: find path after domain
    const match = url.match(/^https?:\/\/[^\/]+(\/.*)?$/);
    return match?.[1] || '/';
  }
}

/**
 * Convert .ts extension to .m3u8 for browser compatibility
 * Xtream Codes servers automatically convert this on the fly
 * 
 * Note: Native apps can play .ts directly, but browsers need HLS (.m3u8)
 */
function convertTsToM3u8(path: string): string {
  // Match .ts at end or before query string
  return path.replace(/\.ts(\?|$)/, '.m3u8$1');
}

/**
 * Convert stream URL to use Cloudflare Direct Tunnel (IPTV Smarters method)
 * 
 * This rewrites the URL to go through our Cloudflare-proxied domain,
 * which acts as an SSL tunnel to the IPTV provider.
 * 
 * @param originalUrl - The original IPTV stream URL (usually HTTP)
 * @param options - Configuration options
 * @returns The tunneled HTTPS URL
 */
export function convertToTunnel(
  originalUrl: string, 
  options: { 
    convertTs?: boolean;  // Convert .ts to .m3u8 (default: true for browser playback)
  } = {}
): string {
  const { convertTs = true } = options;
  
  if (!originalUrl) return originalUrl;
  
  // Already using the tunnel
  if (isCloudflareUrl(originalUrl)) {
    console.log('[cloudflare-tunnel] URL already tunneled');
    return originalUrl;
  }
  
  // Don't convert Supabase proxy URLs (shouldn't happen in new flow)
  if (isSupabaseProxyUrl(originalUrl)) {
    console.warn('[cloudflare-tunnel] Received Supabase proxy URL - this should not happen in Direct Tunnel mode');
    return originalUrl;
  }
  
  // Extract the path from the original URL
  let path = extractPath(originalUrl);
  
  // Convert .ts to .m3u8 for browser compatibility
  if (convertTs) {
    const originalPath = path;
    path = convertTsToM3u8(path);
    if (path !== originalPath) {
      console.log('[cloudflare-tunnel] Converted .ts → .m3u8 for browser compatibility');
    }
  }
  
  // Build the tunneled URL
  const tunneledUrl = `${CLOUDFLARE_VPN_DOMAIN}${path}`;
  
  console.log('[cloudflare-tunnel] ─────────────────────────');
  console.log('[cloudflare-tunnel] Mode: Direct Tunnel (Cloudflare)');
  console.log('[cloudflare-tunnel] Original:', originalUrl.substring(0, 60) + '...');
  console.log('[cloudflare-tunnel] Tunneled:', tunneledUrl.substring(0, 60) + '...');
  console.log('[cloudflare-tunnel] ─────────────────────────');
  
  return tunneledUrl;
}

/**
 * Legacy function - now uses direct tunneling
 * @deprecated Use convertToTunnel instead
 */
export function rewriteToProxy(url: string): string {
  return convertToTunnel(url);
}

/**
 * Legacy function - now uses direct tunneling  
 * @deprecated Use convertToTunnel instead
 */
export function rewriteToCloudflare(url: string): string {
  return convertToTunnel(url);
}

/**
 * Full transformation: route through Cloudflare tunnel
 * This is the main function called by xtream-api.ts
 * 
 * @param url - The original stream URL  
 * @param _options - Deprecated options (preferM3u8 is now always true for browsers)
 */
export function transformStreamUrl(url: string, _options?: { preferM3u8?: boolean }): string {
  return convertToTunnel(url, { convertTs: true });
}

/**
 * Extract original URL path from a tunneled URL
 * Useful for building external player links
 */
export function getOriginalPath(tunneledUrl: string): string {
  if (!isCloudflareUrl(tunneledUrl)) {
    return tunneledUrl;
  }
  
  try {
    const urlObj = new URL(tunneledUrl);
    return urlObj.pathname + urlObj.search;
  } catch {
    return tunneledUrl.replace(CLOUDFLARE_VPN_DOMAIN, '');
  }
}

/**
 * Reconstruct original provider URL from tunneled URL
 * Used for external player fallback (VLC, MPV, etc.)
 * 
 * @param tunneledUrl - The Cloudflare tunneled URL
 * @param originalDomain - The original provider domain (e.g., 'http://line.myox.me')
 */
export function getOriginalProviderUrl(tunneledUrl: string, originalDomain: string): string {
  const path = getOriginalPath(tunneledUrl);
  
  // Ensure original domain doesn't have trailing slash
  const domain = originalDomain.replace(/\/$/, '');
  
  return `${domain}${path}`;
}

/**
 * Get connection type for UI display
 */
export function getConnectionType(): 'cloudflare-tunnel' | 'supabase-proxy' | 'direct' {
  return 'cloudflare-tunnel';
}

/**
 * Get connection display name for debug UI
 */
export function getConnectionDisplayName(): string {
  return 'Secure Tunnel (Cloudflare)';
}
