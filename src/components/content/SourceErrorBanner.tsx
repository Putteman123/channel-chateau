import { AlertTriangle, Settings } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface SourceErrorBannerProps {
  error: Error;
  sourceName?: string;
}

export function SourceErrorBanner({ error, sourceName }: SourceErrorBannerProps) {
  const navigate = useNavigate();
  const errorMessage = error.message.toLowerCase();

  const isDnsError = errorMessage.includes('dns') ||
                     errorMessage.includes('server not found') ||
                     errorMessage.includes('cloudflare');

  const isTimeoutError = errorMessage.includes('timeout') ||
                         errorMessage.includes('timed out');

  const isConnectionError = errorMessage.includes('refused') ||
                            errorMessage.includes('unreachable');

  let title = 'Streamkälla otillgänglig';
  let description = error.message;

  if (isDnsError) {
    title = 'IPTV-leverantören har DNS-problem';
    description = `Din IPTV-leverantör${sourceName ? ` (${sourceName})` : ''} har DNS-konfigurationsproblem eller är tillfälligt nere. Detta är ett problem hos leverantören som de måste åtgärda. Prova igen senare eller kontakta din leverantör.`;
  } else if (isTimeoutError) {
    title = 'Servern svarar inte';
    description = `Servern${sourceName ? ` för ${sourceName}` : ''} svarar inte i tid. Detta kan bero på överbelastning eller nätverksproblem. Prova igen om några minuter.`;
  } else if (isConnectionError) {
    title = 'Kan inte ansluta till servern';
    description = `Kan inte ansluta till servern${sourceName ? ` för ${sourceName}` : ''}. Kontrollera dina inställningar eller försök igen senare.`;
  }

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm">{description}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/settings/sources')}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Gå till inställningar
        </Button>
      </AlertDescription>
    </Alert>
  );
}
