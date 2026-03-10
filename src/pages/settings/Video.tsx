import { useTranslation } from 'react-i18next';
import { Play, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePlayerPreference, PlayerEngine } from '@/hooks/usePlayerPreference';
import { toast } from 'sonner';

const playerOptions: { value: PlayerEngine; label: string; description: string }[] = [
  {
    value: 'shaka',
    label: 'Shaka Player (Standard)',
    description: 'Googles OTT-spelare med stabil HLS-support',
  },
  {
    value: 'videojs',
    label: 'Video.js (Rekommenderad)',
    description: 'Robust HLS/MPEG-TS-spelare med bred kompatibilitet',
  },
  {
    value: 'clappr',
    label: 'Clappr',
    description: 'Bättre för vissa IPTV-strömmar och äldre format',
  },
  {
    value: 'native',
    label: 'Native HTML5',
    description: 'Webbläsarens inbyggda spelare (begränsat formatstöd)',
  },
];

export default function VideoSettings() {
  const { t } = useTranslation();
  const { preferredPlayer, setPreferredPlayer, isLoading } = usePlayerPreference();

  const handlePlayerChange = (value: PlayerEngine) => {
    setPreferredPlayer(value);
    toast.success(`Videomotor ändrad till ${playerOptions.find(p => p.value === value)?.label}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('settings.video', 'Videoinställningar')}</h2>
        <p className="text-muted-foreground">
          {t('settings.videoDescription', 'Anpassa videouppspelning och spelarkonfiguration')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Videomotor
          </CardTitle>
          <CardDescription>
            Byt spelare om strömmen hackar eller inte startar. Olika spelare hanterar 
            strömmar på olika sätt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="player-select">Välj videomotor</Label>
            <Select
              value={preferredPlayer}
              onValueChange={handlePlayerChange}
              disabled={isLoading}
            >
              <SelectTrigger id="player-select" className="w-full">
                <SelectValue placeholder="Välj spelare..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {playerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Player info cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className={`rounded-lg border p-4 transition-colors ${preferredPlayer === 'shaka' ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Play className="h-4 w-4 text-primary" />
                Shaka Player
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Industristandard OTT-spelare från Google. Stöder ABR (adaptiv bithastighet), 
                kvalitetsbyte och DRM. Bäst för HLS-strömmar.
              </p>
            </div>

            <div className={`rounded-lg border p-4 transition-colors ${preferredPlayer === 'clappr' ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Play className="h-4 w-4 text-orange-500" />
                Clappr
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Flexibel spelare som ofta fungerar bättre med IPTV-strömmar. 
                Kan hantera format som andra spelare har problem med.
              </p>
            </div>

            <div className={`rounded-lg border p-4 transition-colors ${preferredPlayer === 'native' ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Play className="h-4 w-4 text-muted-foreground" />
                Native HTML5
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Webbläsarens inbyggda videospelare. Använder hårdvaruacceleration 
                för MP4/MKV men har begränsat HLS-stöd.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips section */}
      <Card>
        <CardHeader>
          <CardTitle>Tips för uppspelningsproblem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Strömmen startar inte:</strong> Prova byta till Clappr - den hanterar 
            ofta strömmar som Shaka Player har problem med.
          </p>
          <p>
            <strong>Buffrar mycket:</strong> Om strömmen buffrar ofta, kontrollera din 
            internetanslutning eller testa med proxy avstängd i källinställningarna.
          </p>
          <p>
            <strong>Ljudet fungerar men inte bilden:</strong> Detta kan bero på codec-problem. 
            Öppna strömmen i VLC via "Öppna externt"-menyn.
          </p>
          <p>
            <strong>"Leverantören blockerar":</strong> Din IPTV-leverantör blockerar 
            proxy-anslutningar. Använd VLC eller annan extern spelare.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
