import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    
    console.log(`[stream-proxy] Proxying: ${redactUrl(decodedUrl).substring(0, 100)}...`);
    if (customUserAgent || customReferer) {
      console.log(`[stream-proxy] Custom headers: UA=${customUserAgent ? 'yes' : 'no'}, Referer=${customReferer ? 'yes' : 'no'}`);
    }

    // Extract origin from stream URL for Referer/Origin headers (fallback)
    let streamOrigin = "";
    try {
      streamOrigin = new URL(decodedUrl).origin;
    } catch {
      // Invalid URL, skip origin headers
    }

    // Get Range header from incoming request (important for VOD seeking)
    const rangeHeader = req.headers.get("Range");
    
    // Build fetch headers - use VLC User-Agent for maximum IPTV compatibility
    const fetchHeaders: Record<string, string> = {
      "User-Agent": customUserAgent || "VLC/3.0.18 LibVLC/3.0.18",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Connection": "keep-alive",
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

    // Build URL list to try - prioritize HTTP for live streams (IPTV providers often block HTTPS)
    const isLiveStream = decodedUrl.includes('/live/') || decodedUrl.endsWith('.ts');
    const urlsToTry: string[] = [];
    
    if (decodedUrl.startsWith("https://")) {
      if (isLiveStream) {
        urlsToTry.push(decodedUrl.replace("https://", "http://"));
        urlsToTry.push(decodedUrl);
      } else {
        urlsToTry.push(decodedUrl);
        urlsToTry.push(decodedUrl.replace("https://", "http://"));
      }
    } else if (decodedUrl.startsWith("http://")) {
      urlsToTry.push(decodedUrl);
      if (!isLiveStream) {
        urlsToTry.push(decodedUrl.replace("http://", "https://"));
      }
    } else {
      urlsToTry.push(decodedUrl);
    }

    let response: Response | null = null;
    let lastError: Error | null = null;
    let finalUrl: string = decodedUrl;

    for (const urlToTry of urlsToTry) {
      try {
        console.log(`[stream-proxy] Trying: ${urlToTry.substring(0, 60)}...`);
        
        // CRITICAL: redirect: 'follow' makes the proxy follow redirects INTERNALLY
        // The client never sees the 302 - we handle it server-side (Man-in-the-Middle)
        response = await fetch(urlToTry, {
          headers: fetchHeaders,
          redirect: "follow", // Follow redirects internally - never send to client!
        });

        // Log the final URL after redirects
        if (response.url !== urlToTry) {
          console.log(`[stream-proxy] Followed redirect to: ${response.url.substring(0, 80)}...`);
          finalUrl = response.url;
        }

        // Accept 200 OK and 206 Partial Content (for Range requests)
        if (response.ok || response.status === 206) {
          console.log(`[stream-proxy] Success (HTTP ${response.status}) - Final URL: ${finalUrl.substring(0, 60)}...`);
          break;
        } else {
          const statusCode = response.status;
          console.error(`[stream-proxy] HTTP ${statusCode} from: ${urlToTry.substring(0, 60)}...`);
          lastError = new Error(`HTTP ${statusCode}`);
          (lastError as any).httpStatus = statusCode;
          response = null;
        }
      } catch (err) {
        console.error(`[stream-proxy] Connection failed: ${err}`);
        lastError = err instanceof Error ? err : new Error(String(err));
        response = null;
      }
    }

    if (!response || (!response.ok && response.status !== 206)) {
      const isConnectionRefused = lastError?.message?.includes("Connection refused") || 
                                   lastError?.message?.includes("ECONNREFUSED");
      const isHttp458 = lastError?.message?.includes("458");
      const actualHttpStatus = (lastError as any)?.httpStatus;
      
      console.error(`[stream-proxy] All URLs failed. Last error: ${lastError?.message}, HTTP status: ${actualHttpStatus || 'unknown'}`);
      
      // Determine appropriate response
      let responseStatus: number;
      let errorType: string;
      let hint: string;
      
      if (isHttp458 || actualHttpStatus === 458) {
        responseStatus = 458;
        errorType = "Provider blocking";
        hint = "HTTP 458 - leverantören blockerar datacenter-IP. Öppna strömmen i VLC/MPV.";
      } else if (actualHttpStatus === 403) {
        responseStatus = 403;
        errorType = "Access denied";
        hint = "Åtkomst nekad (HTTP 403). Kontrollera prenumerationen.";
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
      } else {
        responseStatus = actualHttpStatus || 502;
        errorType = "Upstream unreachable";
        hint = `Kunde inte nå strömmen (HTTP ${actualHttpStatus || 'okänd'}).`;
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorType,
          details: lastError?.message || "Could not connect to stream",
          hint,
          httpStatus: responseStatus,
          isProviderBlocking: isHttp458 || isConnectionRefused || actualHttpStatus === 458,
        }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get content info from response
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");
    
    // Handle m3u8 playlists - rewrite URLs to go through proxy
    if (contentType.includes("mpegurl") || contentType.includes("m3u8") || finalUrl.includes(".m3u8")) {
      const text = await response.text();
      
      // Get base URL for relative paths (from FINAL URL after redirects)
      const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
      
      // Dynamically determine proxy domain from request URL
      const requestUrl = new URL(req.url);
      const proxyBase = `${requestUrl.origin}/functions/v1/stream-proxy`;
      console.log(`[stream-proxy] Rewriting m3u8 with proxy base: ${proxyBase}`);
      
      // Build query params to propagate custom headers
      const headerParams = [];
      if (customUserAgent) headerParams.push(`userAgent=${encodeURIComponent(customUserAgent)}`);
      if (customReferer) headerParams.push(`referer=${encodeURIComponent(customReferer)}`);
      const headerSuffix = headerParams.length > 0 ? `&${headerParams.join('&')}` : '';

      // Rewrite URLs in playlist
      const rewrittenPlaylist = text.split("\n").map(line => {
        const trimmed = line.trim();
        
        if (trimmed === "") return line;
        
        // Handle comments but check for URI= in EXT-X-KEY
        if (trimmed.startsWith("#")) {
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
              const fullUrl = uri.startsWith("http") ? uri : baseUrl + uri;
              return `URI="${proxyBase}?url=${encodeURIComponent(fullUrl)}${headerSuffix}"`;
            });
          }
          return line;
        }
        
        // Rewrite segment URLs
        if (trimmed.startsWith("http")) {
          return `${proxyBase}?url=${encodeURIComponent(trimmed)}${headerSuffix}`;
        } else if (trimmed.length > 0) {
          const fullUrl = baseUrl + trimmed;
          return `${proxyBase}?url=${encodeURIComponent(fullUrl)}${headerSuffix}`;
        }
        
        return line;
      }).join("\n");

      console.log(`[stream-proxy] Rewrote m3u8 playlist (${text.length} bytes)`);

      return new Response(rewrittenPlaylist, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store, must-revalidate",
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