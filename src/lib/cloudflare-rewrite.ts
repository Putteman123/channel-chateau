/**
 * Cloudflare Domain Rewrite Utility
 * Replaces IPTV provider domain with secure Cloudflare proxy domain
 * This bypasses Mixed Content issues without using Supabase Edge Functions
 */

// The secure Cloudflare domain that proxies to IPTV providers
export const CLOUDFLARE_VPN_DOMAIN = 'https://vpn.premiumvinted.se';

// Known IPTV provider domains to replace
const PROVIDER_DOMAINS = [
  'http://line.myox.me',
  'http://line.premiumvinted.se',
];

/**
 * Rewrite a stream URL to use the secure Cloudflare VPN domain
 * Preserves the path (e.g., /live/user/pass/123.ts)
 */
export function rewriteToCloudflare(url: string): string {
  if (!url) return url;
  
  // Already using the secure domain
  if (url.startsWith(CLOUDFLARE_VPN_DOMAIN)) {
    return url;
  }
  
  // Replace known provider domains
  for (const domain of PROVIDER_DOMAINS) {
    if (url.startsWith(domain)) {
      const rewritten = url.replace(domain, CLOUDFLARE_VPN_DOMAIN);
      console.log('[cloudflare-rewrite] Rewrote:', domain, '→', CLOUDFLARE_VPN_DOMAIN);
      return rewritten;
    }
  }
  
  // For any other HTTP URL, try to replace the origin
  if (url.startsWith('http://')) {
    try {
      const parsed = new URL(url);
      const rewritten = url.replace(`http://${parsed.host}`, CLOUDFLARE_VPN_DOMAIN);
      console.log('[cloudflare-rewrite] Rewrote HTTP origin:', parsed.host, '→', CLOUDFLARE_VPN_DOMAIN);
      return rewritten;
    } catch (e) {
      console.warn('[cloudflare-rewrite] Failed to parse URL:', url);
    }
  }
  
  // Return original if HTTPS or parsing failed
  return url;
}

/**
 * Convert .ts to .m3u8 for better browser compatibility
 * Many IPTV providers support both formats
 */
export function convertTsToM3u8(url: string): string {
  if (url.endsWith('.ts')) {
    return url.replace(/\.ts$/, '.m3u8');
  }
  // Handle .ts with query params
  return url.replace(/\.ts(\?|$)/, '.m3u8$1');
}

/**
 * Full transformation: rewrite domain + convert format
 */
export function transformStreamUrl(url: string, options?: { preferM3u8?: boolean }): string {
  const { preferM3u8 = true } = options || {};
  
  // Step 1: Rewrite to Cloudflare
  let transformed = rewriteToCloudflare(url);
  
  // Step 2: Convert .ts to .m3u8 if preferred
  if (preferM3u8 && (url.includes('.ts?') || url.endsWith('.ts'))) {
    transformed = convertTsToM3u8(transformed);
    console.log('[cloudflare-rewrite] Converted .ts → .m3u8');
  }
  
  console.log('[cloudflare-rewrite] Final URL:', transformed);
  return transformed;
}

/**
 * Check if URL is using the Cloudflare VPN domain
 */
export function isCloudflareUrl(url: string): boolean {
  return url.startsWith(CLOUDFLARE_VPN_DOMAIN);
}

/**
 * Extract original URL from Cloudflare URL (for external player links)
 * Note: This just reverses the domain, we don't know the original provider
 */
export function getOriginalProviderUrl(cloudflareUrl: string, originalDomain: string): string {
  if (!isCloudflareUrl(cloudflareUrl)) return cloudflareUrl;
  return cloudflareUrl.replace(CLOUDFLARE_VPN_DOMAIN, originalDomain);
}
