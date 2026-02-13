import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
  if (!PERPLEXITY_API_KEY) {
    return new Response(JSON.stringify({ error: 'PERPLEXITY_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a movie and TV expert. Return ONLY valid JSON, no markdown, no explanation.',
          },
          {
            role: 'user',
            content: 'List the top 10 most popular movies and top 10 most popular TV series right now globally. For each item include: title (in English), year, and a brief one-sentence description. Return as JSON with this exact structure: {"movies": [{"title": "...", "year": 2025, "description": "..."}], "series": [{"title": "...", "year": 2025, "description": "..."}]}',
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'trending_content',
            schema: {
              type: 'object',
              properties: {
                movies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      year: { type: 'number' },
                      description: { type: 'string' },
                    },
                    required: ['title', 'year', 'description'],
                  },
                },
                series: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      year: { type: 'number' },
                      description: { type: 'string' },
                    },
                    required: ['title', 'year', 'description'],
                  },
                },
              },
              required: ['movies', 'series'],
            },
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Perplexity API error [${response.status}]: ${JSON.stringify(data)}`);
    }

    const content = data.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch {
      throw new Error('Failed to parse Perplexity response as JSON');
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Perplexity trending error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
