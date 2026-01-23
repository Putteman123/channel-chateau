-- Add M3U support columns to stream_sources
ALTER TABLE public.stream_sources
ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'xtream' CHECK (source_type IN ('xtream', 'm3u')),
ADD COLUMN IF NOT EXISTS m3u_url TEXT;

-- Make Xtream-specific columns nullable for M3U sources
ALTER TABLE public.stream_sources
ALTER COLUMN server_url DROP NOT NULL,
ALTER COLUMN username DROP NOT NULL,
ALTER COLUMN password DROP NOT NULL;

-- Add constraint: Xtream sources must have server_url/username/password, M3U sources must have m3u_url
-- We'll handle this in application logic rather than DB constraint for flexibility

COMMENT ON COLUMN public.stream_sources.source_type IS 'Type of stream source: xtream or m3u';
COMMENT ON COLUMN public.stream_sources.m3u_url IS 'Full M3U playlist URL for m3u type sources';