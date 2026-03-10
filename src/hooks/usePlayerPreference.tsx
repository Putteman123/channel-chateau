import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type PlayerEngine = 'shaka' | 'clappr' | 'native' | 'videojs';

export interface PlayerPreference {
  preferredPlayer: PlayerEngine;
  setPreferredPlayer: (player: PlayerEngine) => void;
  isLoading: boolean;
}

export function usePlayerPreference(): PlayerPreference {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('preferred_player')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updatePreference = useMutation({
    mutationFn: async (player: PlayerEngine) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({ preferred_player: player })
        .eq('user_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  const setPreferredPlayer = (player: PlayerEngine) => {
    updatePreference.mutate(player);
  };

  return {
    preferredPlayer: (profile?.preferred_player as PlayerEngine) || 'shaka',
    setPreferredPlayer,
    isLoading,
  };
}
