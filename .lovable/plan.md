

## GitHub Actions: Bygg Android APK automatiskt

### Vad vi gör
Skapar en GitHub Actions workflow-fil som bygger en Android debug-APK i molnet. Du kan sedan ladda ner APK-filen direkt från GitHub -- perfekt när du jobbar från surfplattan.

### Hur det fungerar
1. Du går till ditt GitHub-repo, klickar **Actions** och väljer **"Build Android APK"**
2. Klickar **"Run workflow"**
3. Väntar ca 5-10 minuter
4. Laddar ner den färdiga APK-filen som en zip under **Artifacts**

### Viktigt att veta
Den nuvarande appen laddar sitt gränssnitt från Lovables servrar (hot-reload). APK:n kommer alltså kräva internetanslutning för att fungera. Om du vill ha en helt fristående app behöver vi ändra Capacitor-konfigurationen i ett separat steg.

---

### Tekniska detaljer

**Ny fil:** `.github/workflows/build-android.yml`

Workflowet gör följande steg:

1. **Trigger:** `workflow_dispatch` (manuell start från GitHub)
2. **Runner:** `ubuntu-latest`
3. **Setup:**
   - Checkar ut koden
   - Installerar Node.js 20
   - Installerar JDK 17
4. **Build:**
   - `npm ci` -- installerar dependencies
   - `npm run build` -- bygger React-appen till `dist/`
   - `npx cap add android` -- skapar `android/`-mappen (den finns inte i repot)
   - `npx cap sync android` -- syncar webbinnehållet till Android-projektet
5. **Gradle:**
   - Gör `gradlew` körbar
   - Kör `./gradlew assembleDebug` i `android/`-mappen
6. **Artifact:**
   - Laddar upp `android/app/build/outputs/apk/debug/app-debug.apk` som en nedladdningsbar artifact med 7 dagars lagring

