import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Announcement {
  id: string;
  message: string;
  type: string;
}

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchActiveAnnouncement();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('announcements-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        () => {
          fetchActiveAnnouncement();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchActiveAnnouncement() {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, message, type')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching announcement:', error);
        return;
      }

      setAnnouncement(data);
    } catch (error) {
      console.error('Error fetching announcement:', error);
    }
  }

  if (!announcement || dismissed.has(announcement.id)) {
    return null;
  }

  const getStyles = () => {
    switch (announcement.type) {
      case 'error':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400';
      default:
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
    }
  };

  const getIcon = () => {
    switch (announcement.type) {
      case 'error':
      case 'warning':
        return <AlertTriangle className="h-4 w-4 flex-shrink-0" />;
      default:
        return <Info className="h-4 w-4 flex-shrink-0" />;
    }
  };

  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 mb-4 ${getStyles()}`}>
      <div className="flex items-center gap-3">
        {getIcon()}
        <p className="text-sm">{announcement.message}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 hover:bg-transparent opacity-60 hover:opacity-100"
        onClick={() => setDismissed(prev => new Set(prev).add(announcement.id))}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
