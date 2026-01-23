import { AlertCircle, RefreshCw, ShieldAlert, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface LoadErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  error?: Error | unknown;
}

// Check if error is a proxy block (502/connection refused)
function isProxyBlockError(error: unknown): boolean {
  if (!error) return false;
  const errorStr = String(error).toLowerCase();
  return (
    errorStr.includes('502') ||
    errorStr.includes('upstream unreachable') ||
    errorStr.includes('connection refused') ||
    errorStr.includes('econnrefused') ||
    errorStr.includes('blocked')
  );
}

export function LoadError({ 
  title, 
  message, 
  onRetry, 
  isRetrying = false,
  error 
}: LoadErrorProps) {
  const { t } = useTranslation();
  const isBlocked = isProxyBlockError(error);

  if (isBlocked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Card className="max-w-lg text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
              <ShieldAlert className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
            </div>
            <CardTitle>Leverantören blockerar proxy</CardTitle>
            <CardDescription className="space-y-2">
              <p>
                Din IPTV-leverantör blockerar anslutningar från datacenter-IP-adresser. 
                Detta är vanligt bland leverantörer för att förhindra delning.
              </p>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 text-left text-sm">
              <p className="font-medium mb-2">Vad du kan göra:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Använd en extern spelare (VLC, IPTV Smarters) direkt från din enhet</li>
                <li>Kontakta din leverantör för att fråga om de tillåter proxy-åtkomst</li>
                <li>Prova att lägga till källan som M3U-spellista istället</li>
              </ul>
            </div>
            <div className="flex gap-2 justify-center">
              {onRetry && (
                <Button 
                  variant="outline"
                  onClick={onRetry} 
                  disabled={isRetrying}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                  {isRetrying ? 'Försöker igen...' : 'Försök igen'}
                </Button>
              )}
              <Link to="/settings/sources">
                <Button variant="default" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Hantera källor
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>{title || t('error.loadFailed', 'Kunde inte ladda innehåll')}</CardTitle>
          <CardDescription>
            {message || t('error.loadFailedDesc', 'Ett fel uppstod vid laddning av innehåll. Kontrollera din anslutning och försök igen.')}
          </CardDescription>
        </CardHeader>
        {onRetry && (
          <CardContent>
            <Button 
              onClick={onRetry} 
              disabled={isRetrying}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying 
                ? t('error.retrying', 'Försöker igen...') 
                : t('error.retry', 'Försök igen')
              }
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
