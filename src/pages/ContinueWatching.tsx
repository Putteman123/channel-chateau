import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { History, Trash2 } from 'lucide-react';
import { useStream } from '@/contexts/StreamContext';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { ContentCard } from '@/components/content/ContentCard';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function ContinueWatching() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSource } = useStream();
  const { continueWatching, history, clearHistory, getProgress } = useWatchHistory(activeSource?.id);

  if (continueWatching.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <History className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="mt-4 text-xl font-semibold">{t('continueWatching.noItems')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('continueWatching.noItemsDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('continueWatching.title')}</h1>
          <p className="text-muted-foreground">
            {t('continueWatching.itemsStarted', { count: continueWatching.length })}
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Trash2 className="h-4 w-4" />
              {t('continueWatching.clearHistory')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('continueWatching.clearHistoryTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('continueWatching.clearHistoryDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => clearHistory.mutate()}>
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {continueWatching.map((item) => (
            <ContentCard
              key={item.id}
              id={item.item_id}
              title={item.item_name || t('common.unknown')}
            poster={item.item_poster || undefined}
            type={item.item_type === 'episode' ? 'series' : item.item_type as 'channel' | 'movie' | 'series'}
            progress={getProgress(item.stream_source_id, item.item_type, item.item_id)}
            onPlay={() => {
              if (item.item_type === 'series' || item.item_type === 'episode') {
                navigate(`/series/${item.series_id}`);
              }
            }}
          />
        ))}
      </div>

      {/* Full History */}
      {history.length > continueWatching.length && (
        <div className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">{t('continueWatching.watchHistory')}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {history
              .filter((h) => !continueWatching.some((c) => c.id === h.id))
              .slice(0, 18)
              .map((item) => (
                <ContentCard
                  key={item.id}
                  id={item.item_id}
                  title={item.item_name || t('common.unknown')}
                  poster={item.item_poster || undefined}
                  type={item.item_type === 'episode' ? 'series' : item.item_type as 'channel' | 'movie' | 'series'}
                  progress={100}
                  onPlay={() => {
                    if (item.item_type === 'series' || item.item_type === 'episode') {
                      navigate(`/series/${item.series_id}`);
                    }
                  }}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
