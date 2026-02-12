import { Play, Download, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface ExternalPlayerOptionsProps {
  streamUrl: string;
  channelName: string;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function ExternalPlayerOptions({ streamUrl, channelName }: ExternalPlayerOptionsProps) {
  const handleOpenVLC = () => {
    const url = isIOS()
      ? `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(streamUrl)}`
      : `vlc://${streamUrl}`;
    window.location.href = url;
  };

  const handleDownloadM3U = () => {
    const content = `#EXTM3U\n#EXTINF:-1,${channelName}\n${streamUrl}`;
    const blob = new Blob([content], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channelName}.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Spellista nedladdad', description: `${channelName}.m3u` });
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(streamUrl);
      toast({ title: 'Kopierat!', description: 'Strömlänken har kopierats till urklipp.' });
    } catch {
      toast({ title: 'Kunde inte kopiera', description: 'Kopiera länken manuellt.', variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-card p-6 text-center shadow-lg">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Välj uppspelningsmetod</h3>
        <p className="text-sm text-muted-foreground">
          Webbuppspelning blockeras av leverantören. Använd en extern spelare för att titta.
        </p>
      </div>

      <Button
        size="lg"
        onClick={handleOpenVLC}
        className="w-full gap-2 bg-[#ff8800] text-white hover:bg-[#e67a00] focus-visible:ring-[#ff8800]"
      >
        <Play className="h-5 w-5" />
        Öppna i VLC
        <ExternalLink className="ml-auto h-4 w-4 opacity-60" />
      </Button>

      <div className="flex w-full gap-3">
        <Button variant="outline" className="flex-1 gap-2" onClick={handleDownloadM3U}>
          <Download className="h-4 w-4" />
          Ladda ner .m3u
        </Button>
        <Button variant="ghost" className="flex-1 gap-2" onClick={handleCopyUrl}>
          <Copy className="h-4 w-4" />
          Kopiera länk
        </Button>
      </div>
    </div>
  );
}
