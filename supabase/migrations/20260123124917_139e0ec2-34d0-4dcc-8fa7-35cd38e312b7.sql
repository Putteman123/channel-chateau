-- Change default for prefer_ts_vod to true
ALTER TABLE public.stream_sources 
ALTER COLUMN prefer_ts_vod SET DEFAULT true;

-- Update existing sources to have prefer_ts_vod = true
UPDATE public.stream_sources SET prefer_ts_vod = true WHERE prefer_ts_vod = false;