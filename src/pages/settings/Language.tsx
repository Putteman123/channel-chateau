import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useLanguage, SupportedLanguage } from '@/hooks/useLanguage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

export default function Language() {
  const { t } = useTranslation();
  const { currentLanguage, setLanguage, languages } = useLanguage();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('settings.language.title')}</h2>
        <p className="text-muted-foreground">{t('settings.language.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('settings.language.title')}
          </CardTitle>
          <CardDescription>{t('settings.language.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={currentLanguage}
            onValueChange={(value) => setLanguage(value as SupportedLanguage)}
            className="space-y-3"
          >
            {languages.map((lang) => (
              <div key={lang.code} className="flex items-center space-x-3">
                <RadioGroupItem value={lang.code} id={lang.code} />
                <Label htmlFor={lang.code} className="cursor-pointer flex-1">
                  <span className="font-medium">{lang.nativeName}</span>
                  {lang.code !== 'en' && (
                    <span className="ml-2 text-muted-foreground">({lang.name})</span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  );
}
