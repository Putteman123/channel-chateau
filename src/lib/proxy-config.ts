/**
 * Proxy Configuration
 * Configure stream proxying with automatic fallback
 */

// Supabase fallback URL (always works)
export const SUPABASE_PROXY_URL = import.meta.env.VITE_SUPABASE_URL 
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-proxy`
  : '';

// Custom Cloudflare VPN domain for Direct Tunneling (IPTV Smarters method)
// Note: This domain proxies DIRECTLY to the IPTV provider, NOT through Edge Functions
export const CUSTOM_PROXY_DOMAIN = 'https://vpn.premiumvinted.se';

// Whether to prefer custom domain (will auto-fallback if unavailable)
export const USE_CUSTOM_PROXY = true;

// Extract hostname from custom domain for URL matching
export const CUSTOM_PROXY_HOSTNAME = CUSTOM_PROXY_DOMAIN ? new URL(CUSTOM_PROXY_DOMAIN).hostname : '';

// Cache for domain availability (null = not tested, true/false = result)
let customDomainAvailable: boolean | null = null;
let testInProgress: Promise<boolean> | null = null;

/**
 * Test if VPN tunnel domain is reachable
 * Uses a short timeout to avoid blocking the app
 * Caches the result for the session
 */
export async function testCustomDomain(): Promise<boolean> {
  // Return cached result if already tested
  if (customDomainAvailable !== null) {
    return customDomainAvailable;
  }
  
  // Return existing test if in progress (prevent duplicate requests)
  if (testInProgress) {
    return testInProgress;
  }
  
  testInProgress = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      // For VPN tunnel, test root path with no-cors mode
      // IPTV servers don't set CORS headers, but video elements don't need them
      const response = await fetch(
        `${CUSTOM_PROXY_DOMAIN}/`,
        { 
          method: 'HEAD', 
          signal: controller.signal,
          mode: 'no-cors', // Use no-cors since IPTV servers don't support CORS
        }
      );
      clearTimeout(timeout);
      
      // With no-cors mode, we get an opaque response (status=0, type=opaque)
      // This is expected and means the server is reachable
      // Any response (even opaque) means the tunnel is working
      customDomainAvailable = true;
      console.log(`[proxy-config] VPN tunnel test: AVAILABLE (opaque response - IPTV servers don't support CORS)`);
      return customDomainAvailable;
    } catch (err) {
      console.warn('[proxy-config] VPN tunnel unavailable:', err instanceof Error ? err.message : err);
      customDomainAvailable = false;
      return false;
    } finally {
      testInProgress = null;
    }
  })();
  
  return testInProgress;
}

/**
 * Reset domain availability cache (useful for retrying)
 */
export function resetDomainCache(): void {
  customDomainAvailable = null;
  testInProgress = null;
  console.log('[proxy-config] Domain cache reset');
}

/**
 * Get working proxy URL with automatic fallback (async version)
 * Tests the custom domain first, falls back to Supabase if unavailable
 * NOTE: This returns the SUPABASE proxy URL, not the VPN tunnel
 * Use getVpnTunnelDomain() for Direct Tunneling
 */
export async function getWorkingProxyBaseUrl(): Promise<string> {
  // Always return Supabase proxy for API calls
  // Direct Tunneling is handled separately by cloudflare-rewrite.ts
  return SUPABASE_PROXY_URL;
}

/**
 * Get proxy base URL (sync version)
 * Returns Supabase proxy URL for API calls
 * Direct Tunneling for video streams is handled by cloudflare-rewrite.ts
 */
export function getProxyBaseUrl(): string {
  return SUPABASE_PROXY_URL;
}

/**
 * Get VPN tunnel domain for Direct Tunneling video streams
 */
export function getVpnTunnelDomain(): string {
  return CUSTOM_PROXY_DOMAIN;
}

/**
 * Check if VPN tunnel is available
 */
export function isVpnTunnelAvailable(): boolean {
  return customDomainAvailable === true;
}

/**
 * Get the domain name for display purposes
 */
export function getProxyDomainName(): string {
  // Return VPN tunnel domain if available (for video streams)
  if (customDomainAvailable === true) {
    try {
      return new URL(CUSTOM_PROXY_DOMAIN).hostname;
    } catch {
      return CUSTOM_PROXY_DOMAIN;
    }
  }
  
  // Otherwise return Supabase
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      return new URL(supabaseUrl).hostname;
    } catch {
      return 'supabase';
    }
  }
  return 'unknown';
}

/**
 * Check if using custom proxy (and it's available)
 */
export function isUsingCustomProxy(): boolean {
  return USE_CUSTOM_PROXY && !!CUSTOM_PROXY_DOMAIN && customDomainAvailable === true;
}

/**
 * Get current domain availability status
 */
export function getCustomDomainStatus(): 'available' | 'unavailable' | 'untested' {
  if (customDomainAvailable === null) return 'untested';
  return customDomainAvailable ? 'available' : 'unavailable';
}
