-- Add column to force HTTP protocol for live streams
ALTER TABLE public.stream_sources 
ADD COLUMN force_http_live BOOLEAN NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.stream_sources.force_http_live IS 'When true, live stream URLs will be converted from HTTPS to HTTP before proxying';