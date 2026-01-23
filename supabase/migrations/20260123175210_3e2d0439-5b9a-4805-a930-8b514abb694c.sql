-- Add expires_at column to track subscription expiry
ALTER TABLE public.stream_sources
ADD COLUMN expires_at TIMESTAMPTZ DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.stream_sources.expires_at IS 'Subscription expiry date. NULL means unlimited or unknown.';