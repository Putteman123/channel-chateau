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
    const { fileId } = await req.json();

    if (!fileId) {
      return new Response(JSON.stringify({ error: 'fileId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Request download link from OpenSubtitles
    const downloadRes = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Streamify v1.0',
      },
      body: JSON.stringify({ file_id: fileId }),
    });

    if (!downloadRes.ok) {
      const errorText = await downloadRes.text();
      console.error('OpenSubtitles download error:', downloadRes.status, errorText);
      return new Response(JSON.stringify({ error: `Download error: ${downloadRes.status}` }), {
        status: downloadRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const downloadData = await downloadRes.json();
    const subtitleUrl = downloadData.link;

    if (!subtitleUrl) {
      return new Response(JSON.stringify({ error: 'No download link returned' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the actual subtitle file content
    const subtitleRes = await fetch(subtitleUrl);
    if (!subtitleRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch subtitle file' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const srtContent = await subtitleRes.text();

    // Convert SRT to WebVTT for browser compatibility
    const vttContent = srtToVtt(srtContent);

    return new Response(JSON.stringify({ vtt: vttContent, srt: srtContent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Subtitle download error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Convert SRT subtitle format to WebVTT
 */
function srtToVtt(srt: string): string {
  let vtt = 'WEBVTT\n\n';
  
  // Normalize line endings
  const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Split into blocks
  const blocks = normalized.split(/\n\n+/);
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    
    // Find the timestamp line (contains -->)
    let timestampIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timestampIdx = i;
        break;
      }
    }
    
    if (timestampIdx === -1) continue;
    
    // Convert comma to dot in timestamps (SRT uses comma, VTT uses dot)
    const timestamp = lines[timestampIdx].replace(/,/g, '.');
    const text = lines.slice(timestampIdx + 1).join('\n');
    
    if (text.trim()) {
      vtt += `${timestamp}\n${text}\n\n`;
    }
  }
  
  return vtt;
}
