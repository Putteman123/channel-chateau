/**
 * Proxy Configuration
 * Configure stream proxying with automatic fallback
 */

// Supabase fallback URL (always works)
export const SUPABASE_PROXY_URL = import.meta.env.VITE_SUPABASE_URL 
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-proxy`
  : '';

// Custom Cloudflare domain for proxying streams (may not always be available)
export const CUSTOM_PROXY_DOMAIN = 'https://line.premiumvinted.se';

// Whether to prefer custom domain (will auto-fallback if unavailable)
export const USE_CUSTOM_PROXY = true;

// Extract hostname from custom domain for URL matching
export const CUSTOM_PROXY_HOSTNAME = CUSTOM_PROXY_DOMAIN ? new URL(CUSTOM_PROXY_DOMAIN).hostname : '';

// Cache for domain availability (null = not tested, true/false = result)
let customDomainAvailable: boolean | null = null;
let testInProgress: Promise<boolean> | null = null;

/**
 * Test if custom domain is reachable
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
      
      const response = await fetch(
        `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`,
        { 
          method: 'HEAD', 
          signal: controller.signal,
          mode: 'cors',
        }
      );
      clearTimeout(timeout);
      
      // 400 = missing url param = proxy is working
      // 200 = also working
      customDomainAvailable = response.ok || response.status === 400;
      console.log(`[proxy-config] Custom domain test: ${customDomainAvailable ? 'AVAILABLE' : 'UNAVAILABLE'} (HTTP ${response.status})`);
      return customDomainAvailable;
    } catch (err) {
      console.warn('[proxy-config] Custom domain unavailable:', err instanceof Error ? err.message : err);
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
 */
export async function getWorkingProxyBaseUrl(): Promise<string> {
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN) {
    const isAvailable = await testCustomDomain();
    if (isAvailable) {
      return `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`;
    }
    console.warn('[proxy-config] Custom domain unavailable, using Supabase fallback');
  }
  return SUPABASE_PROXY_URL;
}

/**
 * Get proxy base URL (sync version)
 * Uses cached test result if available, otherwise falls back to Supabase
 */
export function getProxyBaseUrl(): string {
  // If custom proxy is enabled AND domain test passed, use custom
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN && customDomainAvailable === true) {
    return `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`;
  }
  
  // If we haven't tested yet, still use Supabase for safety
  // (the async test will update this for future calls)
  return SUPABASE_PROXY_URL;
}

/**
 * Get the domain name for display purposes
 */
export function getProxyDomainName(): string {
  // Return actual domain being used based on availability
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN && customDomainAvailable === true) {
    try {
      return new URL(CUSTOM_PROXY_DOMAIN).hostname;
    } catch {
      return CUSTOM_PROXY_DOMAIN;
    }
  }
  
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
