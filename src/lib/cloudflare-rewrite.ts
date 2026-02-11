/**
 * Cloudflare Direct Tunneling Utility (IPTV Smarters Method)
 * 
 * Routes streams through our Cloudflare-proxied domain for SSL tunneling.
 * This bypasses Mixed Content blocks by converting HTTP streams to HTTPS.
 * 
 * The Cloudflare domain (vpn.premiumvinted.se) proxies directly to the
 * IPTV provider's IP address, making HTTP streams accessible via HTTPS.
 * 
 * HYBRID APPROACH:
 * - Domain-based URLs → Cloudflare Tunnel (faster, uses edge network)
 * - IP-based URLs → Supabase Edge Function (universal proxy for any IP)
 * 
 * This is necessary because Cloudflare DNS can only point to ONE IP address,
 * but IPTV providers often use multiple backend IPs.
 */

// The secure Cloudflare VPN domain that proxies to IPTV providers
export const CLOUDFLARE_VPN_DOMAIN = 'https://vpn.premiumvinted.se';

// Supabase Edge Function for IP-based URLs (universal fallback)
export const SUPABASE_PROXY_BASE = 'https://qeeqaqsftdrtnlceqzcj.supabase.co/functions/v1/stream-proxy';

// Known IPTV provider domains to rewrite
const PROVIDER_DOMAINS = [
  'http://line.myox.me',
  'http://line.premiumvinted.se',
];

// Cache for domain availability
let tunnelAvailable: boolean | null = null;
let testInProgress: Promise<boolean> | null = null;

/**
 * Check if a URL contains an IP address instead of a domain name
 * 
 * Examples:
 * - http://185.245.0.183/live/... → true
 * - http://185.245.0.183:8080/live/... → true
 * - http://[::1]/live/... → true (IPv6)
 * - http://line.myox.me/live/... → false
 */
export function isIpAddress(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    // IPv4: 185.245.0.183
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    // IPv6: [::1] or bare ::1
    const isIPv6 = hostname.startsWith('[') || hostname.includes(':');
    return isIPv4 || isIPv6;
  } catch {
    // Fallback: check for IP pattern in URL
    return /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?\//.test(url);
  }
}

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
 * Check if URL is using the Supabase proxy format
 */
export function isSupabaseProxyUrl(url: string): boolean {
  return url.includes('/functions/v1/stream-proxy');
}

/**
 * Check if URL is proxied (either Cloudflare tunnel or Supabase proxy)
 */
export function isProxiedUrl(url: string): boolean {
  return isCloudflareUrl(url) || isSupabaseProxyUrl(url);
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
 * NOTE: This function only handles DOMAIN-based URLs.
 * For IP-based URLs, use tunnelOrProxy() which routes to Edge Function.
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
  
  // Already using the tunnel or proxy
  if (isProxiedUrl(originalUrl)) {
    console.log('[cloudflare-tunnel] URL already proxied');
    return originalUrl;
  }
  
  // IP-based URLs: extract path and route through tunnel too
  if (isIpAddress(originalUrl)) {
    console.log('[cloudflare-tunnel] IP-address detected - routing through tunnel');
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
 * Route URL through Supabase Edge Function proxy
 * Used for IP-based URLs that can't go through Cloudflare tunnel
 * 
 * @param originalUrl - The original stream URL
 * @param options - Configuration options  
 */
export function proxyViaEdgeFunction(
  originalUrl: string,
  options: { convertTs?: boolean } = {}
): string {
  const { convertTs = true } = options;
  
  if (!originalUrl) return originalUrl;
  
  // Already proxied
  if (isProxiedUrl(originalUrl)) {
    return originalUrl;
  }
  
  // Convert .ts to .m3u8 if needed
  let urlToProxy = originalUrl;
  if (convertTs && originalUrl.includes('.ts')) {
    urlToProxy = originalUrl.replace(/\.ts(\?|$)/, '.m3u8$1');
    console.log('[edge-proxy] Converted .ts → .m3u8 for browser compatibility');
  }
  
  const proxyUrl = `${SUPABASE_PROXY_BASE}?url=${encodeURIComponent(urlToProxy)}`;
  
  console.log('[edge-proxy] ─────────────────────────');
  console.log('[edge-proxy] Mode: Edge Function Proxy (Supabase)');
  console.log('[edge-proxy] Original:', originalUrl.substring(0, 60) + '...');
  console.log('[edge-proxy] Proxied:', proxyUrl.substring(0, 80) + '...');
  console.log('[edge-proxy] ─────────────────────────');
  
  return proxyUrl;
}

/**
 * HYBRID PROXY: Automatically choose the best proxy method
 * 
 * - HLS streams (.m3u8 or /live/) → Edge Function (for manifest rewriting)
 * - IP-based URLs → Edge Function (universal proxy)
 * - Other domain URLs → Cloudflare Tunnel (faster for pass-through)
 * 
 * IMPORTANT: Live HLS streams MUST go through Edge Function to rewrite
 * segment URLs and prevent Mixed Content blocks from secondary servers.
 */
export function tunnelOrProxy(
  originalUrl: string,
  options: { convertTs?: boolean; forceEdgeFunction?: boolean } = {}
): string {
  if (!originalUrl) return originalUrl;
  
  // Already proxied
  if (isProxiedUrl(originalUrl)) {
    return originalUrl;
  }
  
  const { forceEdgeFunction = false } = options;
  
  // Detect if this is a live HLS stream that needs manifest rewriting
  const isLiveStream = originalUrl.includes('/live/') || 
                       originalUrl.includes('.m3u8') ||
                       originalUrl.includes('/play/');
  
  // Route based on URL type and stream type
  // IP addresses → Always Edge Function
  // Live HLS streams → Edge Function (for manifest rewriting)
  // Other → Cloudflare tunnel
  // Route ALL streams through Cloudflare tunnel (line.premiumvinted.se)
  console.log('[hybrid-proxy] Using Cloudflare Tunnel for all streams');
  return convertToTunnel(originalUrl, options);
}

/**
 * Legacy function - now uses hybrid approach
 * @deprecated Use tunnelOrProxy instead
 */
export function rewriteToProxy(url: string): string {
  return tunnelOrProxy(url);
}

/**
 * Legacy function - now uses hybrid approach
 * @deprecated Use tunnelOrProxy instead
 */
export function rewriteToCloudflare(url: string): string {
  return tunnelOrProxy(url);
}

/**
 * Full transformation: route through appropriate proxy
 * This is the main function called by xtream-api.ts
 */
export function transformStreamUrl(url: string, _options?: { preferM3u8?: boolean }): string {
  return tunnelOrProxy(url, { convertTs: true });
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
 * Get connection type based on URL
 */
export function getConnectionType(url: string): 'cloudflare-tunnel' | 'edge-function' | 'direct' {
  if (isCloudflareUrl(url)) return 'cloudflare-tunnel';
  if (isSupabaseProxyUrl(url)) return 'edge-function';
  return 'direct';
}

/**
 * Get connection display name for debug UI
 */
export function getConnectionDisplayName(url?: string): string {
  if (!url) return 'Secure Tunnel (Cloudflare)';
  
  const type = getConnectionType(url);
  switch (type) {
    case 'cloudflare-tunnel':
      return 'Secure Tunnel (Cloudflare)';
    case 'edge-function':
      return 'Edge Function Proxy (Supabase)';
    default:
      return 'Direct Connection';
  }
}
