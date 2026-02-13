

# Fix: triggerEvent-krasch vid appstart i Android-emulatorn

## Problem
`@capgo/capacitor-video-player`-pluginet registreras vid appstart och försöker anropa `triggerEvent` innan Capacitor-bryggan är helt initialiserad. Detta orsakar `Uncaught TypeError: Cannot read properties of undefined (reading 'triggerEvent')` som kraschar appen.

## Orsak
Appen laddar via en fjärr-URL (Lovable preview) i Capacitor-konfigurationen. Capacitor-bryggan injiceras inte lika tillförlitligt i fjärrläge jämfört med lokala filer (`dist/`), och pluginet försöker använda bryggan innan den finns tillgänglig.

## Lösning

### Steg 1: Skydda importen av VideoPlayer-pluginet
I `src/components/player/NativeVideoPlayer.tsx`: Wrappa alla anrop till `VideoPlayer` med en guard som kontrollerar att Capacitor-bryggan är tillgänglig innan pluginet anropas.

### Steg 2: Lazy-importera `@capgo/capacitor-video-player`
Istället för att importera pluginet direkt vid modulladdning (som gör att det registreras och kraschar vid start), byt till en dynamisk import (`await import(...)`) som bara sker när spelaren faktiskt behövs.

Ändring i `NativeVideoPlayer.tsx`:
```typescript
// FÖRE (kraschar vid modulregistrering)
import { VideoPlayer } from '@capgo/capacitor-video-player';

// EFTER (laddas bara vid behov)
let VideoPlayerModule: typeof import('@capgo/capacitor-video-player') | null = null;

async function getVideoPlayer() {
  if (!VideoPlayerModule) {
    VideoPlayerModule = await import('@capgo/capacitor-video-player');
  }
  return VideoPlayerModule.VideoPlayer;
}
```

Alla ställen som anropar `VideoPlayer.xxx()` uppdateras till att använda `const VP = await getVideoPlayer(); VP.xxx()`.

### Steg 3: Skydda useNativePlatform-hooken
I `src/hooks/useNativePlatform.tsx`: Lägg till en try-catch runt `Capacitor.isNativePlatform()` och `Capacitor.getPlatform()` ifall Capacitor-bryggan inte är helt laddad.

## Filer som ändras
1. `src/components/player/NativeVideoPlayer.tsx` -- Byt till dynamisk import av VideoPlayer-pluginet
2. `src/hooks/useNativePlatform.tsx` -- Lägg till try-catch runt Capacitor-anrop

## Förväntat resultat
Appen startar utan krasch i emulatorn. VideoPlayer-pluginet laddas bara när användaren faktiskt försöker spela en video.

## Efter ändringen
1. Gör `git pull` lokalt
2. Kör `npm run build`
3. Kör `npx cap sync`
4. Kör `npx cap run android`
