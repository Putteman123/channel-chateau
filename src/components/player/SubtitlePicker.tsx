import { useState, useEffect } from 'react';
import { Subtitles, Loader2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSubtitles, SubtitleResult } from '@/hooks/useSubtitles';

interface SubtitlePickerProps {
  movieTitle: string;
  tmdbId?: number;
  onSubtitleLoad: (vttUrl: string) => void;
  onSubtitleClear: () => void;
}

const LANG_NAMES: Record<string, string> = {
  sv: 'Svenska',
  en: 'Engelska',
  da: 'Danska',
  no: 'Norska',
  fi: 'Finska',
  de: 'Tyska',
  fr: 'Franska',
  es: 'Spanska',
};

export function SubtitlePicker({ movieTitle, tmdbId, onSubtitleLoad, onSubtitleClear }: SubtitlePickerProps) {
  const [open, setOpen] = useState(false);
  const {
    subtitles,
    isSearching,
    isDownloading,
    activeVttUrl,
    activeLanguage,
    searchSubtitles,
    loadSubtitle,
    clearSubtitle,
  } = useSubtitles();

  // Auto-search when opened
  useEffect(() => {
    if (open && subtitles.length === 0 && !isSearching) {
      searchSubtitles(movieTitle, tmdbId, 'sv,en');
    }
  }, [open, movieTitle, tmdbId]);

  const handleSelect = async (sub: SubtitleResult) => {
    await loadSubtitle(sub.fileId, sub.language);
  };

  // Propagate VTT URL to parent
  useEffect(() => {
    if (activeVttUrl) {
      onSubtitleLoad(activeVttUrl);
    }
  }, [activeVttUrl]);

  const handleClear = () => {
    clearSubtitle();
    onSubtitleClear();
  };

  // Group by language
  const grouped = subtitles.reduce<Record<string, SubtitleResult[]>>((acc, sub) => {
    const lang = sub.language || 'unknown';
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(sub);
    return acc;
  }, {});

  // Sort: Swedish first, then English, then rest
  const sortedLangs = Object.keys(grouped).sort((a, b) => {
    if (a === 'sv') return -1;
    if (b === 'sv') return 1;
    if (a === 'en') return -1;
    if (b === 'en') return 1;
    return a.localeCompare(b);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "text-white hover:bg-white/20",
            activeLanguage && "text-primary"
          )}
          title="Undertexter"
        >
          <Subtitles className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Subtitles className="h-5 w-5" />
            Undertexter
          </DialogTitle>
        </DialogHeader>

        {/* Active subtitle indicator */}
        {activeLanguage && (
          <div className="flex items-center justify-between rounded-lg bg-primary/10 p-3">
            <span className="text-sm">
              Aktiv: <strong>{LANG_NAMES[activeLanguage] || activeLanguage}</strong>
            </span>
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1">
              <X className="h-3 w-3" />
              Stäng av
            </Button>
          </div>
        )}

        {isSearching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Söker undertexter...</span>
          </div>
        ) : subtitles.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Inga undertexter hittades för "{movieTitle}"
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4">
              {sortedLangs.map(lang => (
                <div key={lang}>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                    {LANG_NAMES[lang] || lang.toUpperCase()}
                  </h3>
                  <div className="space-y-1">
                    {grouped[lang].map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => handleSelect(sub)}
                        disabled={isDownloading}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                          activeLanguage === sub.language && "bg-primary/10"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{sub.release || 'Okänd release'}</p>
                          <p className="text-xs text-muted-foreground">
                            {sub.downloadCount} nedladdningar
                            {sub.hearingImpaired && ' · HI'}
                          </p>
                        </div>
                        {isDownloading ? (
                          <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
                        ) : activeLanguage === sub.language ? (
                          <Check className="ml-2 h-4 w-4 shrink-0 text-primary" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
