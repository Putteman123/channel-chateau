import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const email = 'demo@streamify.app'
    const password = 'demo1234'

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(u => u.email === email)

    let userId: string

    if (existing) {
      userId = existing.id
      console.log('Demo user already exists:', userId)
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: 'Demo User' },
      })

      if (createError) throw createError
      userId = newUser.user.id
      console.log('Created demo user:', userId)
    }

    // Check if IPTV.org source already exists
    const { data: existingSources } = await supabaseAdmin
      .from('stream_sources')
      .select('id')
      .eq('user_id', userId)
      .eq('source_type', 'm3u')
      .ilike('name', '%IPTV.org%')

    if (existingSources && existingSources.length > 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Demo user already has IPTV.org source',
        credentials: { email, password },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Add IPTV.org M3U source
    const { error: sourceError } = await supabaseAdmin
      .from('stream_sources')
      .insert({
        user_id: userId,
        name: 'IPTV.org - Free Worldwide',
        source_type: 'm3u',
        m3u_url: 'https://iptv-org.github.io/iptv/index.m3u',
        is_active: true,
        use_proxy: false,
        prefer_ts_live: false,
        prefer_ts_vod: false,
      })

    if (sourceError) throw sourceError

    return new Response(JSON.stringify({
      success: true,
      message: 'Demo user created with IPTV.org playlist',
      credentials: { email, password },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
