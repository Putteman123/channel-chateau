

## Fixa emulatorn: Aktivera hot-reload och ProGuard

### Steg 1: Uppdatera `capacitor.config.ts`
Avkommentera `server`-blocket så appen laddas från Lovable-förhandsvisningen istället för lokala filer. Detta löser problemet med att appen hänger sig vid start.

### Steg 2: Användarens steg efter ändringen
Kör dessa kommandon lokalt:
```text
npm run build
npx cap sync android
npx cap run android
```

### Tekniska detaljer
- `capacitor.config.ts`: Aktiverar `server.url` till `https://75dc2d8a-a96b-483c-b665-5c65c33f188b.lovableproject.com?forceHideBadge=true` med `cleartext: true`
- Appen kommer att ladda gränssnittet via nätverket istället för från den lokala `dist/`-mappen, vilket kringgår problemet med att WebView inte kan starta appen korrekt i emulatorn
- ProGuard-felet (`proguard-android.txt` vs `proguard-android-optimize.txt`) behöver fixas manuellt i `android/app/build.gradle` lokalt om det uppstår vid release-byggen

