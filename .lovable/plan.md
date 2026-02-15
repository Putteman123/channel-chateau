

## Bygga en APK för din riktiga telefon

Det här kräver inga kodändringar i Lovable -- allt görs lokalt på din dator.

### Steg-för-steg

1. **Öppna terminalen** i din projektmapp (där `android/`-mappen finns)

2. **Bygg webappen och synka**:
```text
npm run build
npx cap sync android
```

3. **Bygg debug-APK med Gradle**:
```text
cd android
./gradlew assembleDebug
```
På Windows, använd `gradlew.bat assembleDebug` istället.

4. **Hitta APK-filen**:
```text
android/app/build/outputs/apk/debug/app-debug.apk
```

5. **Installera på telefonen** -- välj ett av dessa sätt:
   - **Via USB**: Anslut telefonen med USB-kabel, aktivera "USB-felsökning" i utvecklarinställningar, kör sedan:
     ```text
     adb install android/app/build/outputs/apk/debug/app-debug.apk
     ```
   - **Via filöverföring**: Kopiera APK-filen till telefonen (via USB, e-post, Google Drive etc.) och öppna filen direkt på telefonen. Du behöver tillåta "Installera från okända källor" i telefonens inställningar.

### Viktigt att veta
- Debug-APK:n är inte signerad för publicering i Play Store, men fungerar utmärkt för testning på din egen telefon
- Appen laddar gränssnittet från Lovable-förhandsvisningen via nätet (hot-reload), så telefonen måste ha internetåtkomst
- Om du vill bygga en fristående APK som inte kräver nätverksanslutning till Lovable behöver vi ändra tillbaka `capacitor.config.ts` så appen använder lokala filer (`dist/`) istället

### Om ProGuard-fel uppstår
Ändra i `android/app/build.gradle` -- byt ut:
```text
proguard-android.txt
```
till:
```text
proguard-android-optimize.txt
```

