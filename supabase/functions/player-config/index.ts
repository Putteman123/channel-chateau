import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PlayerConfigRequest {
  sourceId?: string;
  categoryFilter?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface Channel {
  streamId: string;
  name: string;
  category: string;
  logo: string | null;
  streamUrl: string;
  proxyUrl?: string;
  epgChannelId?: string;
  isAdult?: boolean;
  added?: string;
  number?: number;
}

interface ChannelMetadata {
  totalChannels: number;
  categories: string[];
  epgAvailable: boolean;
  connectionStatus: "healthy" | "slow" | "degraded";
  sourceType: "xtream" | "m3u";
  cached: boolean;
}

interface PlayerConfigResponse {
  success: boolean;
  data?: {
    metadata: ChannelMetadata;
    channels: Channel[];
  };
  error?: string;
  message?: string;
}

function parseAuthHeader(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

async function verifyJWT(token: string): Promise<{
  userId: string;
  isValid: boolean;
} | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables");
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    });

    if (!response.ok) {
      return null;
    }

    const userData = await response.json();
    return {
      userId: userData.id,
      isValid: true,
    };
  } catch {
    return null;
  }
}

async function fetchUserProfile(
  userId: string,
  token: string
): Promise<{
  is_banned?: boolean;
} | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=is_banned`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const profiles = await response.json();
    return profiles.length > 0 ? profiles[0] : null;
  } catch {
    return null;
  }
}

async function fetchStreamSources(
  userId: string,
  sourceId: string | undefined,
  token: string
): Promise<Array<{
  id: string;
  name: string;
  server_url?: string;
  username?: string;
  password?: string;
  source_type?: string;
  m3u_url?: string;
  use_proxy?: boolean;
}> | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    let query = `${supabaseUrl}/rest/v1/stream_sources?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true`;

    if (sourceId) {
      query += `&id=eq.${encodeURIComponent(sourceId)}`;
    }

    const response = await fetch(query, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const sources = await response.json();
    return sources;
  } catch {
    return null;
  }
}

function buildPlayerConfigResponse(
  channels: Channel[],
  sourceType: "xtream" | "m3u"
): PlayerConfigResponse {
  const categories = [...new Set(channels.map((c) => c.category))];

  return {
    success: true,
    data: {
      metadata: {
        totalChannels: channels.length,
        categories: categories.filter(Boolean),
        epgAvailable: channels.some((c) => c.epgChannelId),
        connectionStatus: "healthy",
        sourceType,
        cached: false,
      },
      channels,
    },
    message: `Successfully loaded ${channels.length} channels`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = parseAuthHeader(authHeader || "");

    if (!token) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "unauthorized",
          message: "Missing or invalid Authorization header",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const authResult = await verifyJWT(token);
    if (!authResult?.isValid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "invalid_token",
          message: "Invalid or expired JWT token",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const userId = authResult.userId;

    const profile = await fetchUserProfile(userId, token);
    if (!profile) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "user_not_found",
          message: "User profile not found",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (profile.is_banned) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "user_banned",
          message: "Your account has been banned",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const url = new URL(req.url);
    const sourceId = url.searchParams.get("sourceId") || undefined;

    const sources = await fetchStreamSources(userId, sourceId, token);
    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "no_sources",
          message: "No active stream sources configured",
          paymentStatus: "active",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const source = sources[0];
    const channels: Channel[] = [];

    if (source.source_type === "xtream") {
      const proxyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/xtream-proxy`;
      channels.push({
        streamId: "demo-1",
        name: "Demo Channel 1",
        category: "Entertainment",
        logo: "https://images.pexels.com/photos/3561339/pexels-photo-3561339.jpeg?auto=compress&cs=tinysrgb&w=150",
        streamUrl: `${proxyUrl}?id=1`,
        proxyUrl,
        epgChannelId: "ch1",
        number: 1,
      });
      channels.push({
        streamId: "demo-2",
        name: "Demo Channel 2",
        category: "Entertainment",
        logo: "https://images.pexels.com/photos/3561339/pexels-photo-3561339.jpeg?auto=compress&cs=tinysrgb&w=150",
        streamUrl: `${proxyUrl}?id=2`,
        proxyUrl,
        epgChannelId: "ch2",
        number: 2,
      });
    } else if (source.source_type === "m3u") {
      channels.push({
        streamId: "demo-m3u-1",
        name: "M3U Channel 1",
        category: "Sports",
        logo: null,
        streamUrl: source.m3u_url || "",
        number: 1,
      });
      channels.push({
        streamId: "demo-m3u-2",
        name: "M3U Channel 2",
        category: "Sports",
        logo: null,
        streamUrl: source.m3u_url || "",
        number: 2,
      });
    }

    const response = buildPlayerConfigResponse(
      channels,
      (source.source_type as "xtream" | "m3u") || "xtream"
    );

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "ETag": `"${Date.now()}"`,
      },
    });
  } catch (error: unknown) {
    console.error("Player config error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch player configuration";

    return new Response(
      JSON.stringify({
        success: false,
        error: "server_error",
        message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
