-- Add use_proxy column to stream_sources table
ALTER TABLE public.stream_sources 
ADD COLUMN IF NOT EXISTS use_proxy BOOLEAN NOT NULL DEFAULT true;

-- Add comment for clarity
COMMENT ON COLUMN public.stream_sources.use_proxy IS 'Whether to route streams through the proxy (some providers block datacenter IPs)';