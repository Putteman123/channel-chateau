import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

export type SupportedLanguage = 'sv' | 'en';

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLanguage = i18n.language as SupportedLanguage;

  const setLanguage = useCallback(
    (lang: SupportedLanguage) => {
      i18n.changeLanguage(lang);
    },
    [i18n]
  );

  const languages: { code: SupportedLanguage; name: string; nativeName: string }[] = [
    { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
    { code: 'en', name: 'English', nativeName: 'English' },
  ];

  return {
    currentLanguage,
    setLanguage,
    languages,
  };
}
