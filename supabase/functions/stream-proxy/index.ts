import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Stream Proxy Edge Function
 * 
 * Proxies HLS streams (m3u8 + ts segments) through HTTPS to solve Mixed Content issues.
 * Uses ReadableStream for real-time streaming - does NOT buffer entire file.
 * 
 * Usage:
 * GET /stream-proxy?url=<encoded-stream-url>
 * POST /stream-proxy { url: "<stream-url>" }
 */

// Redact sensitive info from URLs for logging
function redactUrl(url: string): string {
  return url.replace(/password=[^&]+/gi, 'password=***')
            .replace(/username=[^&]+/gi, 'username=***');
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

    // Support both GET (query param) and POST (body)
    if (req.method === "GET") {
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
    
    // Log with custom headers info
    const hasCustomHeaders = customUserAgent || customReferer;
    console.log(`[stream-proxy] Proxying: ${redactUrl(decodedUrl).substring(0, 100)}...`);
    if (hasCustomHeaders) {
      console.log(`[stream-proxy] Custom headers: UA=${customUserAgent ? 'yes' : 'no'}, Referer=${customReferer ? 'yes' : 'no'}`);
    }

    // Extract origin from stream URL for Referer/Origin headers (fallback)
    let streamOrigin = "";
    try {
      streamOrigin = new URL(decodedUrl).origin;
    } catch {
      // Invalid URL, skip origin headers
    }

    // Build fetch headers - use custom values if provided, otherwise defaults
    const fetchHeaders: Record<string, string> = {
      "User-Agent": customUserAgent || "VLC/3.0.20 LibVLC/3.0.20",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Connection": "keep-alive",
    };

    // Use custom referer if provided, otherwise fall back to stream origin
    if (customReferer) {
      fetchHeaders["Referer"] = customReferer;
      // Extract origin from custom referer
      try {
        const refererOrigin = new URL(customReferer).origin;
        fetchHeaders["Origin"] = refererOrigin;
      } catch {
        fetchHeaders["Origin"] = customReferer;
      }
    } else if (streamOrigin) {
      fetchHeaders["Referer"] = streamOrigin + "/";
      fetchHeaders["Origin"] = streamOrigin;
    }

    // For live streams (.ts), prioritize HTTP first as many IPTV providers don't support HTTPS
    // For other content, try HTTPS first then fall back to HTTP
    const isLiveStream = decodedUrl.includes('/live/') || decodedUrl.endsWith('.ts');
    const urlsToTry: string[] = [];
    
    if (decodedUrl.startsWith("https://")) {
      if (isLiveStream) {
        // Live streams: Try HTTP first (many IPTV providers don't support HTTPS for live streams)
        urlsToTry.push(decodedUrl.replace("https://", "http://"));
        urlsToTry.push(decodedUrl);
      } else {
        // VOD: Try HTTPS first
        urlsToTry.push(decodedUrl);
        urlsToTry.push(decodedUrl.replace("https://", "http://"));
      }
    } else if (decodedUrl.startsWith("http://")) {
      if (isLiveStream) {
        // Live streams: Stay with HTTP
        urlsToTry.push(decodedUrl);
      } else {
        // VOD: Try HTTPS first
        urlsToTry.push(decodedUrl.replace("http://", "https://"));
        urlsToTry.push(decodedUrl);
      }
    } else {
      urlsToTry.push(decodedUrl);
    }

    let response: Response | null = null;
    let lastError: Error | null = null;

    for (const urlToTry of urlsToTry) {
      try {
        console.log(`[stream-proxy] Trying: ${urlToTry.substring(0, 60)}...`);
        
        response = await fetch(urlToTry, {
          headers: fetchHeaders,
          redirect: "follow",
        });

        if (response.ok) {
          console.log(`[stream-proxy] Success with: ${urlToTry.substring(0, 60)}...`);
          break;
        } else {
          console.warn(`[stream-proxy] HTTP ${response.status} from: ${urlToTry.substring(0, 60)}...`);
          lastError = new Error(`HTTP ${response.status}`);
          response = null;
        }
      } catch (err) {
        console.warn(`[stream-proxy] Connection failed: ${err}`);
        lastError = err instanceof Error ? err : new Error(String(err));
        response = null;
      }
    }

    if (!response || !response.ok) {
      const isConnectionRefused = lastError?.message?.includes("Connection refused") || 
                                   lastError?.message?.includes("ECONNREFUSED");
      const isHttp458 = lastError?.message?.includes("458");
      
      console.error(`[stream-proxy] All URLs failed. Last error: ${lastError?.message}`);
      
      // Determine the appropriate response status and hint
      let responseStatus: number;
      let errorType: string;
      let hint: string;
      
      if (isHttp458) {
        responseStatus = 458; // Return 458 directly so client can detect it
        errorType = "Provider blocking";
        hint = "HTTP 458 innebär att leverantören aktivt blockerar datacenter-IP. Öppna strömmen i VLC eller annan extern spelare för att använda din hem-IP.";
      } else if (isConnectionRefused) {
        responseStatus = 502;
        errorType = "Connection refused";
        hint = "Din IPTV-leverantör blockerar anslutningar från datacenter. Öppna strömmen i VLC eller annan extern spelare.";
      } else {
        responseStatus = 502;
        errorType = "Upstream unreachable";
        hint = "Strömmen är inte tillgänglig. Kontrollera att URL:en är korrekt och att din prenumeration är aktiv.";
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorType,
          details: lastError?.message || "Could not connect to stream",
          hint,
          httpStatus: isHttp458 ? 458 : responseStatus,
          isProviderBlocking: isHttp458 || isConnectionRefused,
        }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");
    
    // For m3u8 playlists, rewrite URLs to go through proxy
    if (contentType.includes("mpegurl") || contentType.includes("m3u8") || decodedUrl.includes(".m3u8")) {
      const text = await response.text();
      
      // Get base URL for relative paths
      const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf("/") + 1);
      
      // CRITICAL: Use the custom Cloudflare proxy domain for segment URLs
      // The req.url may contain internal Supabase URLs which don't match the public domain
      // We MUST use HTTPS to avoid Mixed Content blocking in browsers
      const CUSTOM_PROXY_DOMAIN = "https://line.premiumvinted.se";
      const proxyBase = `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`;
      
      // Build query params to propagate custom headers
      const headerParams = [];
      if (customUserAgent) headerParams.push(`userAgent=${encodeURIComponent(customUserAgent)}`);
      if (customReferer) headerParams.push(`referer=${encodeURIComponent(customReferer)}`);
      const headerSuffix = headerParams.length > 0 ? `&${headerParams.join('&')}` : '';

      // Rewrite URLs in playlist
      const rewrittenPlaylist = text.split("\n").map(line => {
        const trimmed = line.trim();
        
        // Skip empty lines
        if (trimmed === "") return line;
        
        // Handle comments but check for URI= in EXT-X-KEY or similar
        if (trimmed.startsWith("#")) {
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
              const fullUrl = uri.startsWith("http") ? uri : baseUrl + uri;
              return `URI="${proxyBase}?url=${encodeURIComponent(fullUrl)}${headerSuffix}"`;
            });
          }
          return line;
        }
        
        // Rewrite segment URLs - include custom headers for each segment
        if (trimmed.startsWith("http")) {
          return `${proxyBase}?url=${encodeURIComponent(trimmed)}${headerSuffix}`;
        } else if (trimmed.length > 0) {
          // Relative URL
          const fullUrl = baseUrl + trimmed;
          return `${proxyBase}?url=${encodeURIComponent(fullUrl)}${headerSuffix}`;
        }
        
        return line;
      }).join("\n");

      console.log(`[stream-proxy] Rewrote m3u8 playlist (${text.length} bytes) with proxy: ${proxyBase}`);

      return new Response(rewrittenPlaylist, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // For TS segments and other binary content, STREAM directly using ReadableStream
    // This is critical for real-time video - we pipe the response body directly
    if (!response.body) {
      return new Response(
        JSON.stringify({ error: "No response body from upstream" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[stream-proxy] Streaming ${contentType} (${contentLength || 'unknown'} bytes)`);

    // Detect if this is an image for better caching
    const isImage = contentType.includes('image') || 
                    decodedUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)(\?|$)/i);

    // Build response headers
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      // Use longer cache for images (24h), shorter for streams (5min)
      "Cache-Control": isImage ? "max-age=86400, public" : "max-age=300",
    };

    // Pass through content-length if available
    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    // Pipe the stream directly - no buffering!
    return new Response(response.body, {
      status: 200,
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
