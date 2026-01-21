import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Favorite {
  id: string;
  user_id: string;
  stream_source_id: string;
  item_type: 'channel' | 'movie' | 'series';
  item_id: string;
  item_name: string | null;
  item_poster: string | null;
  created_at: string;
}

export function useFavorites(streamSourceId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites, isLoading } = useQuery({
    queryKey: ['favorites', user?.id, streamSourceId],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (streamSourceId) {
        query = query.eq('stream_source_id', streamSourceId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Favorite[];
    },
    enabled: !!user,
  });

  const addFavorite = useMutation({
    mutationFn: async (favorite: Omit<Favorite, 'id' | 'user_id' | 'created_at'>) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          ...favorite,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success('Added to favorites');
    },
    onError: (error) => {
      toast.error('Failed to add favorite: ' + error.message);
    },
  });

  const removeFavorite = useMutation({
    mutationFn: async ({ streamSourceId, itemType, itemId }: { streamSourceId: string; itemType: string; itemId: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('stream_source_id', streamSourceId)
        .eq('item_type', itemType)
        .eq('item_id', itemId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success('Removed from favorites');
    },
    onError: (error) => {
      toast.error('Failed to remove favorite: ' + error.message);
    },
  });

  const isFavorite = (streamSourceId: string, itemType: string, itemId: string) => {
    return favorites?.some(
      f => f.stream_source_id === streamSourceId && f.item_type === itemType && f.item_id === itemId
    ) ?? false;
  };

  return {
    favorites: favorites || [],
    isLoading,
    addFavorite,
    removeFavorite,
    isFavorite,
  };
}
