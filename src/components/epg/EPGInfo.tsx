import { useQuery } from '@tanstack/react-query';
import { Clock, Calendar } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import * as XtreamAPI from '@/lib/xtream-api';

interface EPGInfoProps {
  credentials: XtreamAPI.XtreamCredentials;
  streamId: number;
  compact?: boolean;
}

interface EPGProgram {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  isLive: boolean;
  progress: number;
}

function parseEPGDate(timestamp: string): Date {
  // EPG timestamps can be in various formats
  const ts = parseInt(timestamp);
  if (!isNaN(ts)) {
    return new Date(ts * 1000);
  }
  return new Date(timestamp);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

export function EPGInfo({ credentials, streamId, compact = false }: EPGInfoProps) {
  const { data: epgData, isLoading, error } = useQuery({
    queryKey: ['epg', credentials.serverUrl, streamId],
    queryFn: async () => {
      const data = await XtreamAPI.getEPG(credentials, streamId);
      return data.epg_listings || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  if (isLoading) {
    return compact ? (
      <Skeleton className="h-4 w-48" />
    ) : (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (error || !epgData || epgData.length === 0) {
    return compact ? (
      <span className="text-xs text-muted-foreground">Ingen programinfo</span>
    ) : null;
  }

  const now = new Date();
  
  const programs: EPGProgram[] = epgData.map((listing) => {
    const start = parseEPGDate(listing.start_timestamp || listing.start);
    const end = parseEPGDate(listing.stop_timestamp || listing.end);
    const isLive = now >= start && now <= end;
    
    let progress = 0;
    if (isLive) {
      const total = end.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();
      progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
    } else if (now > end) {
      progress = 100;
    }

    return {
      title: listing.title,
      start,
      end,
      description: listing.description,
      isLive,
      progress,
    };
  }).filter(p => p.end > now); // Only show current and future programs

  const currentProgram = programs.find(p => p.isLive);
  const upcomingPrograms = programs.filter(p => !p.isLive).slice(0, 5);

  if (compact) {
    return (
      <div className="space-y-1">
        {currentProgram && (
          <div className="flex items-center gap-2">
            <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              NU
            </span>
            <span className="line-clamp-1 text-xs">{currentProgram.title}</span>
          </div>
        )}
        {upcomingPrograms[0] && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="text-xs">
              {formatTime(upcomingPrograms[0].start)} - {upcomingPrograms[0].title}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Currently Playing */}
      {currentProgram && (
        <div className="rounded-lg bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
              LIVE
            </span>
            <span className="text-sm text-muted-foreground">
              {formatTime(currentProgram.start)} - {formatTime(currentProgram.end)}
            </span>
          </div>
          <h3 className="mb-2 font-semibold">{currentProgram.title}</h3>
          {currentProgram.description && (
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
              {currentProgram.description}
            </p>
          )}
          <Progress value={currentProgram.progress} className="h-1" />
        </div>
      )}

      {/* Upcoming Programs */}
      {upcomingPrograms.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">Kommande program</h4>
          <ScrollArea className="h-48">
            <div className="space-y-2 pr-4">
              {upcomingPrograms.map((program, index) => (
                <div
                  key={index}
                  className="flex gap-3 rounded-lg bg-card/50 p-3 transition-colors hover:bg-card"
                >
                  <div className="shrink-0 text-sm text-muted-foreground">
                    {formatTime(program.start)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{program.title}</p>
                    {program.description && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {program.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
