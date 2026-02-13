import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SubtitleResult {
  id: string;
  fileId: number;
  language: string;
  release: string;
  downloadCount: number;
  hearingImpaired: boolean;
  fps: number;
}

interface UseSubtitlesReturn {
  subtitles: SubtitleResult[];
  isSearching: boolean;
  isDownloading: boolean;
  activeVttUrl: string | null;
  activeLanguage: string | null;
  searchSubtitles: (query: string, tmdbId?: number, languages?: string) => Promise<void>;
  loadSubtitle: (fileId: number, language: string) => Promise<void>;
  clearSubtitle: () => void;
}

export function useSubtitles(): UseSubtitlesReturn {
  const [subtitles, setSubtitles] = useState<SubtitleResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeVttUrl, setActiveVttUrl] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);

  const searchSubtitles = useCallback(async (query: string, tmdbId?: number, languages = 'sv,en') => {
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('subtitle-search', {
        body: { query, tmdbId, languages },
      });
      if (error) throw error;
      setSubtitles(data.subtitles || []);
    } catch (e) {
      console.error('Subtitle search error:', e);
      setSubtitles([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const loadSubtitle = useCallback(async (fileId: number, language: string) => {
    setIsDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('subtitle-download', {
        body: { fileId },
      });
      if (error) throw error;

      // Create a blob URL for the VTT content
      const blob = new Blob([data.vtt], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);

      // Revoke previous URL
      if (activeVttUrl) URL.revokeObjectURL(activeVttUrl);

      setActiveVttUrl(url);
      setActiveLanguage(language);
    } catch (e) {
      console.error('Subtitle download error:', e);
    } finally {
      setIsDownloading(false);
    }
  }, [activeVttUrl]);

  const clearSubtitle = useCallback(() => {
    if (activeVttUrl) URL.revokeObjectURL(activeVttUrl);
    setActiveVttUrl(null);
    setActiveLanguage(null);
  }, [activeVttUrl]);

  return {
    subtitles,
    isSearching,
    isDownloading,
    activeVttUrl,
    activeLanguage,
    searchSubtitles,
    loadSubtitle,
    clearSubtitle,
  };
}
