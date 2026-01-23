-- Add prefer_ts_live setting to stream_sources
ALTER TABLE public.stream_sources 
ADD COLUMN prefer_ts_live boolean NOT NULL DEFAULT true;

-- Add comment explaining the column
COMMENT ON COLUMN public.stream_sources.prefer_ts_live IS 'When true, use .ts format instead of .m3u8 for live streams through proxy (helps bypass provider blocking)';