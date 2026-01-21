import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface StreamSource {
  id: string;
  user_id: string;
  name: string;
  server_url: string;
  username: string;
  password: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

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
    mutationFn: async (source: Omit<StreamSource, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_synced_at'>) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('stream_sources')
        .insert({
          user_id: user.id,
          ...source,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream-sources'] });
      toast.success('Stream source added successfully');
    },
    onError: (error) => {
      toast.error('Failed to add stream source: ' + error.message);
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
      toast.success('Stream source updated');
    },
    onError: (error) => {
      toast.error('Failed to update stream source: ' + error.message);
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
      toast.success('Stream source deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete stream source: ' + error.message);
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
