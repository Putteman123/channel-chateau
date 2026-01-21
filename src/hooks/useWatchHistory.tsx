import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface WatchHistoryItem {
  id: string;
  user_id: string;
  stream_source_id: string;
  item_type: 'channel' | 'movie' | 'series' | 'episode';
  item_id: string;
  item_name: string | null;
  item_poster: string | null;
  series_id: string | null;
  season_num: number | null;
  episode_num: number | null;
  position_seconds: number;
  duration_seconds: number | null;
  watched_at: string;
}

export function useWatchHistory(streamSourceId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: history, isLoading } = useQuery({
    queryKey: ['watch-history', user?.id, streamSourceId],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user.id)
        .order('watched_at', { ascending: false })
        .limit(50);
      
      if (streamSourceId) {
        query = query.eq('stream_source_id', streamSourceId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as WatchHistoryItem[];
    },
    enabled: !!user,
  });

  const updateHistory = useMutation({
    mutationFn: async (item: Omit<WatchHistoryItem, 'id' | 'user_id' | 'watched_at'>) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('watch_history')
        .upsert({
          user_id: user.id,
          ...item,
          watched_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,stream_source_id,item_type,item_id',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch-history'] });
    },
  });

  const clearHistory = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('watch_history')
        .delete()
        .eq('user_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch-history'] });
    },
  });

  const getProgress = (streamSourceId: string, itemType: string, itemId: string) => {
    const item = history?.find(
      h => h.stream_source_id === streamSourceId && h.item_type === itemType && h.item_id === itemId
    );
    if (!item || !item.duration_seconds) return 0;
    return (item.position_seconds / item.duration_seconds) * 100;
  };

  // Get items that are in progress (watched but not finished)
  const continueWatching = history?.filter(h => {
    if (!h.duration_seconds) return false;
    const progress = (h.position_seconds / h.duration_seconds) * 100;
    return progress > 5 && progress < 95;
  }) || [];

  return {
    history: history || [],
    continueWatching,
    isLoading,
    updateHistory,
    clearHistory,
    getProgress,
  };
}
