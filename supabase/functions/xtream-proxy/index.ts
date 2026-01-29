import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeServerUrl(raw: string): { baseUrl: string; hadProtocol: boolean } {
  let baseUrl = raw.trim();
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  const hadProtocol = baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
  return { baseUrl, hadProtocol };
}

function buildCandidateBaseUrls(serverUrl: string): string[] {
  const { baseUrl, hadProtocol } = normalizeServerUrl(serverUrl);

  // If the user provided a protocol, still try a sensible fallback:
  // - If they provided http://, prefer trying https:// first (many providers support https but users paste http)
  // - If they provided https://, ALSO try http:// as fallback (some providers block 443 from datacenters)
  if (hadProtocol) {
    if (baseUrl.startsWith("http://")) {
      const httpsUrl = `https://${baseUrl.slice("http://".length)}`;
      return [httpsUrl, baseUrl];
    }
    if (baseUrl.startsWith("https://")) {
      const httpUrl = `http://${baseUrl.slice("https://".length)}`;
      return [baseUrl, httpUrl];
    }
    return [baseUrl];
  }

  // If protocol isn't provided, prefer HTTPS first (many providers support it).
  // We'll fall back to HTTP if HTTPS fails.
  return [`https://${baseUrl}`, `http://${baseUrl}`];
}

function buildApiUrl(baseUrl: string, username: string, password: string, action?: string, params?: Record<string, unknown>) {
  let apiUrl = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  if (action) apiUrl += `&action=${encodeURIComponent(action)}`;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        apiUrl += `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
      }
    }
  }
  return apiUrl;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function safeLogUrl(url: string, password: string): string {
  // Avoid leaking password into logs
  return url.replaceAll(password, "***");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { serverUrl, username, password, action, params } = await req.json();

    if (!serverUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const candidates = buildCandidateBaseUrls(serverUrl);

    // Try up to 2 candidates (https then http when protocol not provided)
    // and for each candidate do 1 retry on transient network errors.
    // Some providers are slow from datacenter IPs; keep this high enough to avoid false negatives.
    const timeoutMs = 30_000;
    let lastNetworkError: unknown = null;
    let response: Response | null = null;
    let usedUrl: string | null = null;

    for (const baseUrl of candidates) {
      const apiUrl = buildApiUrl(baseUrl, username, password, action, params);
      usedUrl = apiUrl;
      console.log(`Proxying request to: ${safeLogUrl(apiUrl, password)}`);

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          response = await fetchWithTimeout(
            apiUrl,
            {
              method: "GET",
              headers: {
                "Accept": "application/json",
                "User-Agent": "Lovable-StreamProxy/1.0 (+https://lovable.dev)",
                "Connection": "close",
              },
            },
            timeoutMs,
          );
          lastNetworkError = null;
          
          // Retry on 5xx server errors (often transient)
          if (response.status >= 500 && response.status < 600 && attempt < 2) {
            console.warn(`Upstream returned ${response.status}, retrying (attempt ${attempt}/2)...`);
            response = null;
            continue;
          }
          
          break;
        } catch (err) {
          lastNetworkError = err;
          console.error(`Upstream fetch error (attempt ${attempt}/2) for ${safeLogUrl(apiUrl, password)}:`, err);
        }
      }

      if (response && response.ok) break;
      // If we got a non-ok response, try next candidate
      if (response && !response.ok && candidates.indexOf(baseUrl) < candidates.length - 1) {
        console.log(`Response ${response.status}, trying next candidate...`);
        response = null;
      }
    }

    if (!response) {
      const message = lastNetworkError instanceof Error ? lastNetworkError.message : "Upstream fetch failed";
      return new Response(
        JSON.stringify({
          error: "Upstream unreachable",
          details: message,
          hint:
            "Din IPTV-leverantör kan blockera datacenter-IP eller kräva HTTPS. Prova att skriva server-URL med https:// (om den stöds) eller testa från ett annat nätverk.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!response.ok) {
      // Special handling for EPG 404 - return empty data instead of error
      // EPG data may not exist for all channels
      if (response.status === 404 && action === 'get_short_epg') {
        console.log(`EPG not available for stream_id ${params?.stream_id}, returning empty`);
        return new Response(
          JSON.stringify({ epg_listings: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `API returned status ${response.status}`, url: usedUrl ? safeLogUrl(usedUrl, password) : undefined }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Proxy error:", error);
    const message = error instanceof Error ? error.message : "Proxy request failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
