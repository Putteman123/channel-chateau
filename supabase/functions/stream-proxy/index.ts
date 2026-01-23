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

    // Support both GET (query param) and POST (body)
    if (req.method === "GET") {
      const url = new URL(req.url);
      streamUrl = url.searchParams.get("url");
    } else if (req.method === "POST") {
      const body = await req.json();
      streamUrl = body.url;
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

    // Extract origin from stream URL for Referer/Origin headers
    let streamOrigin = "";
    try {
      streamOrigin = new URL(decodedUrl).origin;
    } catch {
      // Invalid URL, skip origin headers
    }

    // Build fetch headers to mimic VLC player
    const fetchHeaders: Record<string, string> = {
      "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Connection": "keep-alive",
    };

    if (streamOrigin) {
      fetchHeaders["Referer"] = streamOrigin + "/";
      fetchHeaders["Origin"] = streamOrigin;
    }

    // Try HTTPS first, fall back to HTTP if connection refused
    const urlsToTry = [decodedUrl];
    if (decodedUrl.startsWith("https://")) {
      urlsToTry.push(decodedUrl.replace("https://", "http://"));
    } else if (decodedUrl.startsWith("http://")) {
      urlsToTry.unshift(decodedUrl.replace("http://", "https://"));
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
      
      console.error(`[stream-proxy] All URLs failed. Last error: ${lastError?.message}`);
      
      return new Response(
        JSON.stringify({ 
          error: "Upstream unreachable",
          details: lastError?.message || "Could not connect to stream",
          hint: isConnectionRefused 
            ? "Din IPTV-leverantör kan blockera datacenter-IP eller kräva HTTPS. Prova att skriva server-URL med https:// (om den stöds) eller testa från ett annat nätverk."
            : "Strömmen är inte tillgänglig. Kontrollera att URL:en är korrekt.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");
    
    // For m3u8 playlists, rewrite URLs to go through proxy
    if (contentType.includes("mpegurl") || contentType.includes("m3u8") || decodedUrl.includes(".m3u8")) {
      const text = await response.text();
      
      // Get base URL for relative paths
      const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf("/") + 1);
      const proxyBase = req.url.split("?")[0];
      
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
              return `URI="${proxyBase}?url=${encodeURIComponent(fullUrl)}"`;
            });
          }
          return line;
        }
        
        // Rewrite segment URLs
        if (trimmed.startsWith("http")) {
          return `${proxyBase}?url=${encodeURIComponent(trimmed)}`;
        } else if (trimmed.length > 0) {
          // Relative URL
          const fullUrl = baseUrl + trimmed;
          return `${proxyBase}?url=${encodeURIComponent(fullUrl)}`;
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

    // For TS segments and other binary content, STREAM directly using ReadableStream
    // This is critical for real-time video - we pipe the response body directly
    if (!response.body) {
      return new Response(
        JSON.stringify({ error: "No response body from upstream" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[stream-proxy] Streaming ${contentType} (${contentLength || 'unknown'} bytes)`);

    // Build response headers
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "max-age=300",
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
