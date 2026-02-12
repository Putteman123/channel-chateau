import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
};

/**
 * Stream Proxy Edge Function - Man-in-the-Middle Mode
 * 
 * Proxies HLS streams and handles redirects INTERNALLY to avoid Mixed Content issues.
 * The proxy follows all redirects server-side and returns the final content to the client.
 * 
 * Key behaviors:
 * - Follows HTTP 3xx redirects internally (never sends redirect to client)
 * - Handles streams WITHOUT file extensions (assumes MPEG-TS by default)
 * - Does NOT convert .ts to .m3u8 - sends exact URL as-is
 * - Uses VLC User-Agent for IPTV provider compatibility
 * - CACHES redirect URLs to avoid repeated requests to provider
 * - RETRIES with exponential backoff on 458/rate-limiting errors
 * 
 * Usage:
 * GET /stream-proxy?url=<encoded-stream-url>
 * POST /stream-proxy { url: "<stream-url>" }
 */

// ========================================
// REDIRECT URL CACHE (in-memory, 5 min TTL)
// ========================================
interface CachedRedirect {
  finalUrl: string;
  timestamp: number;
}

const redirectCache = new Map<string, CachedRedirect>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedRedirect(originalUrl: string): string | null {
  const cached = redirectCache.get(originalUrl);
  if (!cached) return null;
  
  // Check if cache is still valid
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    redirectCache.delete(originalUrl);
    return null;
  }
  
  console.log(`[stream-proxy] ♻️ Using cached redirect: ${redactUrl(cached.finalUrl).substring(0, 80)}...`);
  return cached.finalUrl;
}

function setCachedRedirect(originalUrl: string, finalUrl: string): void {
  // Only cache if there was an actual redirect
  if (originalUrl !== finalUrl) {
    redirectCache.set(originalUrl, {
      finalUrl,
      timestamp: Date.now(),
    });
    console.log(`[stream-proxy] 📦 Cached redirect: ${redirectCache.size} entries`);
    
    // Clean up old entries periodically (max 1000 entries)
    if (redirectCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of redirectCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
          redirectCache.delete(key);
        }
      }
    }
  }
}

// Redact sensitive info from URLs for logging
function redactUrl(url: string): string {
  return url.replace(/password=[^&]+/gi, 'password=***')
            .replace(/username=[^&]+/gi, 'username=***');
}

// ========================================
// EXPONENTIAL BACKOFF RETRY (for 458 errors)
// ========================================
async function fetchWithRetry(
  url: string, 
  headers: Record<string, string>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<{ response: Response | null; finalUrl: string; error: Error | null }> {
  let lastError: Error | null = null;
  let response: Response | null = null;
  let finalUrl = url;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[stream-proxy] Attempt ${attempt}/${maxRetries}: ${redactUrl(url).substring(0, 80)}...`);
      
      response = await fetch(url, {
        headers,
        redirect: "follow",
      });

       // Always log the final response URL (even if no redirect happened)
       // Helpful for tokenized / IP-locked providers that rewrite URLs server-side.
       console.log(`[stream-proxy] Upstream response.url: ${redactUrl(response.url).substring(0, 120)}...`);
      
      // Track final URL after redirects
      if (response.url !== url) {
        finalUrl = response.url;
        console.log(`[stream-proxy] ✅ Redirect to: ${redactUrl(finalUrl).substring(0, 80)}...`);
      }
      
      // Success - return immediately
      if (response.ok || response.status === 206) {
        return { response, finalUrl, error: null };
      }
      
      // Rate limiting / transient upstream errors - retry with backoff
      // Note: Some IPTV providers intermittently return 5xx for playlist endpoints.
      if (response.status === 458 || response.status === 429 || response.status === 503 || response.status === 502 || response.status === 500) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`[stream-proxy] ⏳ Rate limited (HTTP ${response.status}), waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        lastError = new Error(`HTTP ${response.status}`);
        (lastError as any).httpStatus = response.status;
        response = null;
        continue;
      }
      
      // Other error - don't retry
      lastError = new Error(`HTTP ${response.status}`);
      (lastError as any).httpStatus = response.status;
      return { response: null, finalUrl, error: lastError };
      
    } catch (err) {
      console.error(`[stream-proxy] Attempt ${attempt} failed:`, err);
      lastError = err instanceof Error ? err : new Error(String(err));
      response = null;
      
      // Network errors - retry with backoff
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      if (attempt < maxRetries) {
        console.log(`[stream-proxy] ⏳ Network error, waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  return { response, finalUrl, error: lastError };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let streamUrl: string | null = null;
    let customUserAgent: string | null = null;
    let customReferer: string | null = null;

    // Support GET, HEAD (for preflight checks), and POST
    const isHeadRequest = req.method === "HEAD";
    
    if (req.method === "GET" || isHeadRequest) {
      const url = new URL(req.url);
      streamUrl = url.searchParams.get("url");
      customUserAgent = url.searchParams.get("userAgent");
      customReferer = url.searchParams.get("referer");
    } else if (req.method === "POST") {
      const body = await req.json();
      streamUrl = body.url;
      customUserAgent = body.userAgent || null;
      customReferer = body.referer || null;
    }

    if (!streamUrl) {
      return new Response(
        JSON.stringify({ error: "Missing 'url' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode URL if encoded
    const decodedUrl = decodeURIComponent(streamUrl);
    
    console.log(`[stream-proxy] Proxying: ${redactUrl(decodedUrl).substring(0, 100)}...`);
    if (customUserAgent || customReferer) {
      console.log(`[stream-proxy] Custom headers: UA=${customUserAgent ? 'yes' : 'no'}, Referer=${customReferer ? 'yes' : 'no'}`);
    }

    // ========================================
    // CHECK REDIRECT CACHE FIRST
    // ========================================
    const cachedFinalUrl = getCachedRedirect(decodedUrl);
    const urlToFetch = cachedFinalUrl || decodedUrl;

    // Extract origin from stream URL for Referer/Origin headers (fallback)
    let streamOrigin = "";
    try {
      streamOrigin = new URL(urlToFetch).origin;
    } catch {
      // Invalid URL, skip origin headers
    }

    // Get Range header from incoming request (important for VOD seeking)
    const rangeHeader = req.headers.get("Range");
    
    // ========================================
    // ADVANCED HEADER SPOOFING - Chrome Stealth Mode
    // ========================================
    // Use a modern Chrome browser profile to bypass User-Agent filtering
    // Many IPTV providers block VLC/bot User-Agents but allow browsers
    const chromeUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    const fetchHeaders: Record<string, string> = {
      "User-Agent": customUserAgent || chromeUserAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9,sv;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      // Sec-Fetch headers - make request look like a browser navigation
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      // Additional Chrome headers
      "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    };

    // Forward Range header for VOD seeking support
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
      console.log(`[stream-proxy] Forwarding Range header: ${rangeHeader}`);
    }

    // Use custom referer if provided, otherwise fall back to stream origin
    if (customReferer) {
      fetchHeaders["Referer"] = customReferer;
      try {
        fetchHeaders["Origin"] = new URL(customReferer).origin;
      } catch {
        fetchHeaders["Origin"] = customReferer;
      }
    } else if (streamOrigin) {
      fetchHeaders["Referer"] = streamOrigin + "/";
      fetchHeaders["Origin"] = streamOrigin;
    }
    
    console.log(`[stream-proxy] 🕵️ Stealth Mode: Chrome UA + Sec-Fetch headers`);

    // Build URL list to try - prioritize HTTP for live streams AND M3U fetches
    // Many IPTV providers only support HTTP and reject HTTPS connections from datacenter IPs.
    // EXCEPTION: if the request is already going via our HTTPS tunnel domain, do NOT downgrade.
    const isLiveStream = urlToFetch.includes('/live/') || urlToFetch.endsWith('.ts');
    const isM3uFetch = urlToFetch.includes('type=m3u') || urlToFetch.includes('output=m3u') || 
                       urlToFetch.includes('.m3u') || urlToFetch.includes('get.php');
    const isIptvProvider = isLiveStream || isM3uFetch;

    let isTunnelDomain = false;
    try {
      const host = new URL(urlToFetch).hostname;
      isTunnelDomain = host === 'vpn.premiumvinted.se';
    } catch {
      // ignore
    }
    
    const urlsToTry: string[] = [];
    
    // If we have a cached URL, only try that (no protocol fallback needed)
    if (cachedFinalUrl) {
      urlsToTry.push(cachedFinalUrl);
    } else if (urlToFetch.startsWith("https://")) {
      // If it's already tunneled over HTTPS, keep HTTPS (the tunnel expects TLS).
      if (isTunnelDomain) {
        urlsToTry.push(urlToFetch);
      } else if (isIptvProvider) {
        // For IPTV providers, always try HTTP first (many block HTTPS from datacenters)
        urlsToTry.push(urlToFetch.replace("https://", "http://"));
        // Don't try HTTPS fallback for IPTV - it will likely fail with ECONNREFUSED
      } else {
        urlsToTry.push(urlToFetch);
        urlsToTry.push(urlToFetch.replace("https://", "http://"));
      }
    } else if (urlToFetch.startsWith("http://")) {
      urlsToTry.push(urlToFetch);
      // Don't try HTTPS fallback for IPTV providers - they almost never support it
      if (!isIptvProvider) {
        urlsToTry.push(urlToFetch.replace("http://", "https://"));
      }
    } else {
      urlsToTry.push(urlToFetch);
    }

    let response: Response | null = null;
    let lastError: Error | null = null;
    let finalUrl: string = urlToFetch;

    for (const urlAttempt of urlsToTry) {
      // Use retry with exponential backoff
      const result = await fetchWithRetry(urlAttempt, fetchHeaders, 3, 500);
      
      if (result.response && (result.response.ok || result.response.status === 206)) {
        response = result.response;
        finalUrl = result.finalUrl;
        
        // Cache the successful redirect for future requests
        setCachedRedirect(decodedUrl, finalUrl);
        break;
      }
      
      lastError = result.error;
      if (result.finalUrl) finalUrl = result.finalUrl;
    }

    if (!response || (!response.ok && response.status !== 206)) {
      const isConnectionRefused = lastError?.message?.includes("Connection refused") || 
                                   lastError?.message?.includes("ECONNREFUSED");
      const isHttp458 = lastError?.message?.includes("458");
      const isHttp551 = lastError?.message?.includes("551");
      const actualHttpStatus = (lastError as any)?.httpStatus;
      
      // Log the final URL that was attempted (important for debugging tokenized/IP-locked streams)
      console.error(`[stream-proxy] ❌ All URLs failed.`);
      console.error(`[stream-proxy] Last error: ${lastError?.message}`);
      console.error(`[stream-proxy] HTTP status: ${actualHttpStatus || 'unknown'}`);
      console.error(`[stream-proxy] Final URL attempted: ${redactUrl(finalUrl).substring(0, 100)}...`);
      
      // Determine appropriate response
      let responseStatus: number;
      let errorType: string;
      let hint: string;
      let isIpLocked = false;
      
      // Helper to validate HTTP status (must be 101 or 200-599)
      const isValidHttpStatus = (status: number): boolean => {
        return status === 101 || (status >= 200 && status <= 599);
      };
      
      if (isHttp551 || actualHttpStatus === 551) {
        // HTTP 551 - Advanced blocking, likely IP-locked/tokenized stream
        // IMPORTANT: Some runtimes/clients treat non-standard 5xx like 551 as a platform/runtime error.
        // Return a standard status (423 Locked) but preserve the upstream status in the JSON payload.
        responseStatus = 423;
        errorType = "IP-locked stream";
        hint = "HTTP 551 (upstream) - Strömmen är IP-låst eller tokeniserad. Länken fungerar endast från den IP som genererade den. Använd direktuppspelning via VPN eller öppna i VLC.";
        isIpLocked = true;
        console.error(`[stream-proxy] 🔒 HTTP 551 detected - stream is IP-locked/tokenized`);
      } else if (isHttp458 || actualHttpStatus === 458) {
        // HTTP 458 is non-standard and causes runtime errors in some edge runtimes.
        // Map to 409 Conflict (standard) while preserving upstream status in JSON body.
        responseStatus = 409;
        errorType = "Provider blocking";
        hint = "HTTP 458 (upstream) - leverantören blockerar datacenter-IP. Öppna strömmen i VLC/MPV.";
      } else if (actualHttpStatus === 429) {
        responseStatus = 429;
        errorType = "Rate limited";
        hint = "För många förfrågningar. Vänta en stund och försök igen.";
      } else if (actualHttpStatus === 403) {
        responseStatus = 403;
        errorType = "Access denied";
        hint = "Åtkomst nekad (HTTP 403). Kontrollera prenumerationen eller strömmen kan vara IP-låst.";
      } else if (actualHttpStatus === 404) {
        responseStatus = 404;
        errorType = "Not found";
        hint = "Strömmen hittades inte (HTTP 404).";
      } else if (actualHttpStatus === 500 || actualHttpStatus === 503) {
        responseStatus = actualHttpStatus;
        errorType = "Server error";
        hint = `IPTV-servern fel (HTTP ${actualHttpStatus}).`;
      } else if (isConnectionRefused) {
        responseStatus = 502;
        errorType = "Connection refused";
        hint = "Anslutning nekad. Öppna i VLC/MPV.";
      } else if (actualHttpStatus && !isValidHttpStatus(actualHttpStatus)) {
        // NON-STANDARD HTTP STATUS (e.g., 884, 999) - Map to 502 Bad Gateway
        console.error(`[stream-proxy] ⚠️ Non-standard HTTP status ${actualHttpStatus} - mapping to 502`);
        responseStatus = 502;
        errorType = "Provider error";
        hint = `Leverantören returnerade ogiltigt HTTP-svar (${actualHttpStatus}). Öppna i VLC/MPV.`;
      } else {
        responseStatus = actualHttpStatus || 502;
        // Final safety check - ensure responseStatus is valid
        if (!isValidHttpStatus(responseStatus)) {
          console.error(`[stream-proxy] ⚠️ Invalid status ${responseStatus} - falling back to 502`);
          responseStatus = 502;
        }
        errorType = "Upstream unreachable";
        hint = `Kunde inte nå strömmen (HTTP ${actualHttpStatus || 'okänd'}).`;
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorType,
          details: lastError?.message || "Could not connect to stream",
          hint,
          httpStatus: responseStatus,
          upstreamHttpStatus: actualHttpStatus || null,
          isProviderBlocking: isHttp458 || isConnectionRefused || actualHttpStatus === 458,
          isIpLocked,
          finalUrlAttempted: redactUrl(finalUrl),
        }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Log successful redirect chain
    if (finalUrl !== urlToFetch) {
      console.log(`[stream-proxy] ✅ Redirect chain completed: ${redactUrl(urlToFetch).substring(0, 50)}... → ${redactUrl(finalUrl).substring(0, 50)}...`);
    }

    // Get content info from response
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");
    
    // Handle m3u8 playlists - rewrite ALL URLs to go through proxy (MITM mode)
    if (contentType.includes("mpegurl") || contentType.includes("m3u8") || finalUrl.includes(".m3u8")) {
      const text = await response.text();
      
      // Get base URL for relative paths (from FINAL URL after redirects)
      const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
      
      // Dynamically determine proxy domain from request URL
      const requestUrl = new URL(req.url);
      const proxyBase = `${requestUrl.origin}/functions/v1/stream-proxy`;
      console.log(`[stream-proxy] 📝 Rewriting m3u8 with proxy base: ${proxyBase}`);
      console.log(`[stream-proxy] 📝 Base URL for relative paths: ${redactUrl(baseUrl)}`);
      
      // Build query params to propagate custom headers
      const headerParams = [];
      if (customUserAgent) headerParams.push(`userAgent=${encodeURIComponent(customUserAgent)}`);
      if (customReferer) headerParams.push(`referer=${encodeURIComponent(customReferer)}`);
      const headerSuffix = headerParams.length > 0 ? `&${headerParams.join('&')}` : '';

      // Helper to resolve and proxy a URL
      const proxyUrl = (url: string): string => {
        const fullUrl = url.startsWith("http") ? url : baseUrl + url;
        return `${proxyBase}?url=${encodeURIComponent(fullUrl)}${headerSuffix}`;
      };

      // Rewrite URLs in playlist - handle ALL HLS tags with URLs
      const rewrittenPlaylist = text.split("\n").map(line => {
        const trimmed = line.trim();
        
        if (trimmed === "") return line;
        
        // Handle HLS tags with embedded URLs
        if (trimmed.startsWith("#")) {
          // URI="..." attribute (EXT-X-KEY, EXT-X-MAP, EXT-X-I-FRAME-STREAM-INF, etc.)
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
              return `URI="${proxyUrl(uri)}"`;
            });
          }
          
          // EXT-X-MEDIA with URI attribute
          if (trimmed.startsWith("#EXT-X-MEDIA") && trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
              return `URI="${proxyUrl(uri)}"`;
            });
          }
          
          // EXT-X-I-FRAME-STREAM-INF (I-frame only playlists)
          if (trimmed.startsWith("#EXT-X-I-FRAME-STREAM-INF") && trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
              return `URI="${proxyUrl(uri)}"`;
            });
          }
          
          // EXT-X-PRELOAD-HINT (LL-HLS)
          if (trimmed.startsWith("#EXT-X-PRELOAD-HINT") && trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
              return `URI="${proxyUrl(uri)}"`;
            });
          }
          
          // EXT-X-PART (LL-HLS partial segments)
          if (trimmed.startsWith("#EXT-X-PART") && trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
              return `URI="${proxyUrl(uri)}"`;
            });
          }
          
          // EXT-X-SESSION-DATA with URI
          if (trimmed.startsWith("#EXT-X-SESSION-DATA") && trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
              return `URI="${proxyUrl(uri)}"`;
            });
          }
          
          return line;
        }
        
        // Non-comment lines are segment/playlist URLs
        if (trimmed.length > 0) {
          // Check if it's a valid URL or path (not just whitespace or special chars)
          if (trimmed.startsWith("http") || trimmed.match(/^[a-zA-Z0-9_\-\.\/]/)) {
            return proxyUrl(trimmed);
          }
        }
        
        return line;
      }).join("\n");

      // Count rewritten URLs for logging
      const originalUrlCount = (text.match(/URI="|^[^#\s][^\s]+$/gm) || []).length;
      const rewrittenUrlCount = (rewrittenPlaylist.match(/stream-proxy\?url=/g) || []).length;
      console.log(`[stream-proxy] ✅ Rewrote m3u8: ${text.length} bytes, ${rewrittenUrlCount} URLs proxied`);

      return new Response(rewrittenPlaylist, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Proxy-Rewritten": "true",
          "X-Proxy-Urls-Rewritten": String(rewrittenUrlCount),
        },
      });
    }

    // For all other content (TS segments, extensionless streams, images, etc.)
    // Stream directly using ReadableStream (no buffering)
    if (!response.body) {
      return new Response(
        JSON.stringify({ error: "No response body from upstream" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const upstreamStatus = response.status;
    
    // Detect content type from URL if Content-Type is generic
    let finalContentType = contentType;
    
    // Check if URL has no extension OR ends with a number (like /79662)
    const hasNoExtension = !finalUrl.match(/\.(ts|m3u8|mp4|mkv|avi|jpg|jpeg|png|gif|webp)(\?|$)/i);
    const endsWithNumber = /\/\d+(\?|$)/.test(finalUrl);
    
    if (finalUrl.endsWith('.ts') || finalUrl.includes('.ts?')) {
      finalContentType = 'video/mp2t';
    } else if (finalUrl.includes('.m3u8')) {
      finalContentType = 'application/vnd.apple.mpegurl';
    } else if ((hasNoExtension || endsWithNumber) && 
               (contentType === 'application/octet-stream' || contentType.includes('video'))) {
      // Extensionless URL (like /79662) - assume MPEG-TS for IPTV streams
      finalContentType = 'video/mp2t';
      console.log(`[stream-proxy] Extensionless URL detected, assuming video/mp2t`);
    }
    
    // Detect if this is an image for better caching
    const isImage = contentType.includes('image') || 
                    finalUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)(\?|$)/i);

    console.log(`[stream-proxy] Streaming ${finalContentType} (${contentLength || 'unknown'} bytes, HTTP ${upstreamStatus})`);

    // Build response headers
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": finalContentType,
      "Cache-Control": isImage ? "max-age=86400, public" : "max-age=300",
    };

    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    // Forward Content-Range header for 206 Partial Content responses
    const contentRange = response.headers.get("content-range");
    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    // Indicate we support range requests
    responseHeaders["Accept-Ranges"] = response.headers.get("accept-ranges") || "bytes";

    // For HEAD requests, return headers only (no body) - used by player preflight checks
    if (isHeadRequest) {
      console.log(`[stream-proxy] HEAD request successful - returning headers only`);
      return new Response(null, {
        status: upstreamStatus,
        headers: responseHeaders,
      });
    }

    // Pipe the stream directly - Man-in-the-Middle complete!
    return new Response(response.body, {
      status: upstreamStatus,
      headers: responseHeaders,
    });

  } catch (error: unknown) {
    console.error("[stream-proxy] Error:", error);
    const message = error instanceof Error ? error.message : "Proxy request failed";
    
    return new Response(
      JSON.stringify({ 
        error: message,
        hint: "Ett oväntat fel uppstod i proxyn. Försök igen.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
