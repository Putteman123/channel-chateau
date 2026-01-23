import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface LoadErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function LoadError({ 
  title, 
  message, 
  onRetry, 
  isRetrying = false 
}: LoadErrorProps) {
  const { t } = useTranslation();

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
