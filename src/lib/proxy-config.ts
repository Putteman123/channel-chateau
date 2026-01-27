/**
 * Proxy Configuration
 * Configure custom domain for stream proxying via Cloudflare
 */

// Custom Cloudflare domain for proxying streams
export const CUSTOM_PROXY_DOMAIN = 'https://line.premiumvinted.se';

// Whether to use custom domain or default Supabase
export const USE_CUSTOM_PROXY = true;

// Build the proxy base URL
export function getProxyBaseUrl(): string {
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN) {
    return `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`;
  }
  
  // Fallback to Supabase URL
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl}/functions/v1/stream-proxy` : '';
}

// Get the domain name for display purposes
export function getProxyDomainName(): string {
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN) {
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
      return 'unknown';
    }
  }
  return 'unknown';
}

// Check if using custom proxy
export function isUsingCustomProxy(): boolean {
  return USE_CUSTOM_PROXY && !!CUSTOM_PROXY_DOMAIN;
}
