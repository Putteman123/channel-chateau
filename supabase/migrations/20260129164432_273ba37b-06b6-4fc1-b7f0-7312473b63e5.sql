-- Add custom_epg_url column for XMLTV EPG sources
ALTER TABLE public.stream_sources 
ADD COLUMN custom_epg_url text DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.stream_sources.custom_epg_url IS 'Optional XMLTV EPG URL (e.g. http://domain/xmltv.php?username=...&password=...) for enhanced program guide data';