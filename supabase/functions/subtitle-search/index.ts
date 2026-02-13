import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('OPENSUBTITLES_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENSUBTITLES_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { query, languages, tmdbId, type } = await req.json();

    if (!query && !tmdbId) {
      return new Response(JSON.stringify({ error: 'query or tmdbId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build search params
    const params = new URLSearchParams();
    if (tmdbId) params.set('tmdb_id', String(tmdbId));
    if (query) params.set('query', query);
    if (languages) params.set('languages', languages); // e.g. "sv,en"
    if (type === 'movie') params.set('type', 'movie');
    if (type === 'tv') params.set('type', 'episode');
    params.set('order_by', 'download_count');
    params.set('order_direction', 'desc');

    // Search subtitles
    const searchRes = await fetch(`https://api.opensubtitles.com/api/v1/subtitles?${params}`, {
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Streamify v1.0',
      },
    });

    if (!searchRes.ok) {
      const errorText = await searchRes.text();
      console.error('OpenSubtitles search error:', searchRes.status, errorText);
      return new Response(JSON.stringify({ error: `OpenSubtitles API error: ${searchRes.status}` }), {
        status: searchRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const searchData = await searchRes.json();

    // Map results to a clean format
    const subtitles = (searchData.data || []).slice(0, 20).map((item: any) => ({
      id: item.id,
      fileId: item.attributes?.files?.[0]?.file_id,
      language: item.attributes?.language,
      release: item.attributes?.release,
      downloadCount: item.attributes?.download_count,
      hearingImpaired: item.attributes?.hearing_impaired,
      fps: item.attributes?.fps,
    }));

    return new Response(JSON.stringify({ subtitles }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Subtitle search error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
