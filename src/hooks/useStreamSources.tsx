import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type SourceType = 'xtream' | 'm3u';

export interface StreamSource {
  id: string;
  user_id: string;
  name: string;
  source_type: SourceType;
  // Xtream fields (nullable for M3U sources)
  server_url: string | null;
  username: string | null;
  password: string | null;
  // M3U fields
  m3u_url: string | null;
  // Common fields
  is_active: boolean;
  prefer_ts_live: boolean;
  prefer_ts_vod: boolean;
  last_synced_at: string | null;
  expires_at: string | null; // Subscription expiry date
  created_at: string;
  updated_at: string;
}

export interface AddXtreamSource {
  name: string;
  source_type: 'xtream';
  server_url: string;
  username: string;
  password: string;
  is_active?: boolean;
  prefer_ts_live?: boolean;
  prefer_ts_vod?: boolean;
  expires_at?: string;
}

export interface AddM3USource {
  name: string;
  source_type: 'm3u';
  m3u_url: string;
  is_active?: boolean;
  prefer_ts_live?: boolean;
  prefer_ts_vod?: boolean;
  expires_at?: string;
}

export type AddSourceInput = AddXtreamSource | AddM3USource;

export function useStreamSources() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sources, isLoading, error } = useQuery({
    queryKey: ['stream-sources', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('stream_sources')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as StreamSource[];
    },
    enabled: !!user,
  });

  const addSource = useMutation({
    mutationFn: async (source: AddSourceInput) => {
      if (!user) throw new Error('Not authenticated');

      // Build insert data based on source type
      const baseData = {
        user_id: user.id,
        name: source.name,
        source_type: source.source_type,
        is_active: source.is_active ?? false,
        prefer_ts_live: source.prefer_ts_live ?? true,
        prefer_ts_vod: source.prefer_ts_vod ?? true,
        expires_at: source.expires_at ?? null,
      };

      const insertData = source.source_type === 'xtream'
        ? {
            ...baseData,
            server_url: source.server_url,
            username: source.username,
            password: source.password,
          }
        : {
            ...baseData,
            m3u_url: source.m3u_url,
          };

      const { data, error } = await supabase
        .from('stream_sources')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream-sources'] });
      toast.success('Streamkälla tillagd');
    },
    onError: (error) => {
      toast.error('Kunde inte lägga till källa: ' + error.message);
    },
  });

  const updateSource = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<StreamSource> & { id: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('stream_sources')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream-sources'] });
      toast.success('Streamkälla uppdaterad');
    },
    onError: (error) => {
      toast.error('Kunde inte uppdatera källa: ' + error.message);
    },
  });

  const deleteSource = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('stream_sources')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream-sources'] });
      toast.success('Streamkälla borttagen');
    },
    onError: (error) => {
      toast.error('Kunde inte ta bort källa: ' + error.message);
    },
  });

  const activeSource = sources?.find(s => s.is_active) || sources?.[0];

  return {
    sources: sources || [],
    activeSource,
    isLoading,
    error,
    addSource,
    updateSource,
    deleteSource,
  };
}
