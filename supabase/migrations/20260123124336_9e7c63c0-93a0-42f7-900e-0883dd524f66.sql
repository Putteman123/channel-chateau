-- Add prefer_ts_vod column to stream_sources
ALTER TABLE public.stream_sources 
ADD COLUMN prefer_ts_vod boolean NOT NULL DEFAULT false;