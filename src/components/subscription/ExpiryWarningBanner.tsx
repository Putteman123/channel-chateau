import { AlertTriangle, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { StreamSource } from '@/hooks/useStreamSources';
import { getSubscriptionInfo } from '@/lib/subscription-utils';
import { Button } from '@/components/ui/button';

interface ExpiryWarningBannerProps {
  sources: StreamSource[];
}

export function ExpiryWarningBanner({ sources }: ExpiryWarningBannerProps) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  
  // Find expired sources that haven't been dismissed
  const expiredSources = sources.filter(source => {
    if (dismissed.includes(source.id)) return false;
    const info = getSubscriptionInfo(source.expires_at);
    return info.status === 'expired';
  });

  // Load dismissed state from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('dismissed-expiry-warnings');
    if (stored) {
      setDismissed(JSON.parse(stored));
    }
  }, []);

  const handleDismiss = (sourceId: string) => {
    const newDismissed = [...dismissed, sourceId];
    setDismissed(newDismissed);
    sessionStorage.setItem('dismissed-expiry-warnings', JSON.stringify(newDismissed));
  };

  if (expiredSources.length === 0) return null;

  return (
    <div className="space-y-2">
      {expiredSources.map(source => (
        <div
          key={source.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="text-sm">
              <span className="font-medium">Ditt abonnemang för </span>
              <span className="font-bold">{source.name}</span>
              <span className="font-medium"> har löpt ut. Kontakta din leverantör.</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/20"
            onClick={() => handleDismiss(source.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
