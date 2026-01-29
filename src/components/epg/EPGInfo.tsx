import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as XtreamAPI from '@/lib/xtream-api';
import { useXMLTVEpg } from '@/hooks/useXMLTVEpg';

interface EPGInfoProps {
  credentials: XtreamAPI.XtreamCredentials;
  streamId: number;
  channelName?: string;
  epgChannelId?: string;
  /** Custom XMLTV EPG URL (prioritized over Xtream API) */
  customEpgUrl?: string | null;
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

export function EPGInfo({ 
  credentials, 
  streamId, 
  channelName = '',
  epgChannelId,
  customEpgUrl,
  compact = false 
}: EPGInfoProps) {
  // XMLTV EPG (prioritized if custom URL is provided)
  const xmltvEpg = useXMLTVEpg({
    epgUrl: customEpgUrl,
    enabled: !!customEpgUrl,
  });

  // Standard Xtream EPG (fallback)
  const { data: xtreamEpgData, isLoading: xtreamLoading, error: xtreamError } = useQuery({
    queryKey: ['epg', credentials.serverUrl, streamId],
    queryFn: async () => {
      const data = await XtreamAPI.getEPG(credentials, streamId);
      return data.epg_listings || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    // Only fetch Xtream EPG if no custom XMLTV URL
    enabled: !customEpgUrl,
  });

  // Determine which EPG source to use
  const isLoading = customEpgUrl ? xmltvEpg.isLoading : xtreamLoading;
  const error = customEpgUrl ? xmltvEpg.error : xtreamError;

  // Build programs array from either source
  const now = new Date();
  let programs: EPGProgram[] = [];

  if (customEpgUrl && xmltvEpg.data) {
    // Use XMLTV data
    const xmltvPrograms = xmltvEpg.getProgramsForChannel(streamId, epgChannelId, channelName);
    
    programs = xmltvPrograms
      .map((prog) => {
        const isLive = now >= prog.start && now <= prog.end;
        
        let progress = 0;
        if (isLive) {
          const total = prog.end.getTime() - prog.start.getTime();
          const elapsed = now.getTime() - prog.start.getTime();
          progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
        } else if (now > prog.end) {
          progress = 100;
        }

        return {
          title: prog.title,
          start: prog.start,
          end: prog.end,
          description: prog.description,
          isLive,
          progress,
        };
      })
      .filter(p => p.end > now); // Only show current and future programs
  } else if (xtreamEpgData && xtreamEpgData.length > 0) {
    // Use Xtream API data
    programs = xtreamEpgData
      .map((listing) => {
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
      })
      .filter(p => p.end > now);
  }

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

  if (error || programs.length === 0) {
    return compact ? (
      <span className="text-xs text-muted-foreground">Ingen programinfo</span>
    ) : null;
  }

  const currentProgram = programs.find(p => p.isLive);
  const upcomingPrograms = programs.filter(p => !p.isLive).slice(0, 5);

  if (compact) {
    return (
      <div className="space-y-2">
        {currentProgram && (
          <>
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                NU
              </span>
              <span className="line-clamp-1 text-xs font-medium text-foreground">{currentProgram.title}</span>
            </div>
            {/* IPTVX-style progress bar in accent color */}
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${currentProgram.progress}%` }}
              />
            </div>
          </>
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
      {/* Source indicator */}
      {customEpgUrl && (
        <div className="text-xs text-muted-foreground">
          📺 XMLTV EPG
        </div>
      )}

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
