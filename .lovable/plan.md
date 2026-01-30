

# Plan: Konvertera till Native App med Capacitor + Native Video Player

## Sammanfattning
Din app kan enkelt konverteras till en riktig iOS/Android-app med **Capacitor**. Den stora fördelen är att native-appen kan använda **ExoPlayer (Android)** och **AVPlayer (iOS)** för att spela IPTV-strömmar direkt – utan Mixed Content-problem, utan CORS-begränsningar, och med stöd för råa `.ts`-strömmar.

---

## Varför Native App Löser IPTV-Problemen

| Problem i Webbläsaren | Lösning i Native App |
|-----------------------|----------------------|
| Mixed Content (HTTPS → HTTP blockeras) | ExoPlayer/AVPlayer kan ladda HTTP direkt |
| CORS-begränsningar | Native HTTP-stack ignorerar CORS |
| Inga codecs för `.ts`-format | ExoPlayer hanterar MPEG-TS nativt |
| Redirect till extern IP blockeras | Native följer alla redirects |
| Kräver proxy/tunnel | Ingen proxy behövs! |

---

## Rekommenderad Lösning: Capacitor + Native Video Player Plugin

### Alternativ 1: `capacitor-video-player` (Rekommenderas)
**Fördelar:**
- Aktivt underhållet (senaste release 2024)
- Stöd för HLS, DASH, MP4, och råa strömmar
- Fullskärmsläge med native kontroller
- Fungerar på både iOS och Android

```typescript
import { CapacitorVideoPlayer } from 'capacitor-video-player';

// Spela IPTV-ström direkt utan proxy!
await CapacitorVideoPlayer.initPlayer({
  mode: 'fullscreen',
  url: 'http://185.245.0.183/live/play/TOKEN/79662', // Fungerar!
  playerId: 'iptv-player',
  componentTag: 'div',
});

await CapacitorVideoPlayer.play({ playerId: 'iptv-player' });
```

### Alternativ 2: `capacitor-pm-video-exoplayer`
**Specifikt för ExoPlayer (Android) med iOS-fallback:**
```typescript
import { Exoplayer } from 'capacitor-pm-video-exoplayer';

await Exoplayer.play({
  videoUrl: 'http://line.myox.me/live/user/pass/12345.m3u8',
  mediaType: 'hls', // eller 'ts' för råa transport streams
});
```

---

## Implementationsplan

### Steg 1: Installera Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Channel Chateau" app.lovable.75dc2d8aa96b483cb6655c65c33f188b
```

### Steg 2: Installera Native Video Player Plugin
```bash
npm install capacitor-video-player
# eller för ExoPlayer-specifikt:
npm install capacitor-pm-video-exoplayer
```

### Steg 3: Skapa Hybrid Player-komponent
Uppdatera `PlayerManager.tsx` för att automatiskt välja rätt spelare:

```typescript
// src/components/player/NativeVideoPlayer.tsx
import { Capacitor } from '@capacitor/core';
import { CapacitorVideoPlayer } from 'capacitor-video-player';

export function NativeVideoPlayer({ src, title, onClose }) {
  const isNative = Capacitor.isNativePlatform();
  
  if (isNative) {
    // Native app → Använd ExoPlayer/AVPlayer direkt
    useEffect(() => {
      CapacitorVideoPlayer.initPlayer({
        mode: 'fullscreen',
        url: src, // Ingen proxy behövs!
        playerId: 'main-player',
      });
    }, [src]);
    
    return null; // Native player tar över skärmen
  }
  
  // Webb → Fallback till Shaka med proxy
  return <ShakaPlayer src={src} title={title} onClose={onClose} />;
}
```

### Steg 4: Uppdatera URL-logik
I native-läge behöver vi INTE proxy. Uppdatera `buildLiveStreamUrl`:

```typescript
// src/lib/xtream-api.ts
import { Capacitor } from '@capacitor/core';

export function buildLiveStreamUrl(creds, streamId, options) {
  const rawUrl = `${creds.serverUrl}/live/${creds.username}/${creds.password}/${streamId}.m3u8`;
  
  // Native app → Returnera rå URL (ingen proxy)
  if (Capacitor.isNativePlatform()) {
    return rawUrl;
  }
  
  // Webb → Behöver proxy för Mixed Content
  return tunnelOrProxy(rawUrl, options);
}
```

### Steg 5: Konfigurera Native-plattformar
```bash
# Lägg till plattformar
npx cap add ios
npx cap add android

# Bygg och synka
npm run build
npx cap sync

# Kör på enhet/emulator
npx cap run android
npx cap run ios
```

---

## Ny Arkitektur (Hybrid Webb/Native)

```text
┌─────────────────────────────────────────────────────────┐
│                    PlayerManager                         │
└─────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
   Capacitor.isNativePlatform()?          │
            │                             │
          JA                            NEJ
            │                             │
            ▼                             ▼
┌─────────────────────┐      ┌─────────────────────────┐
│  NativeVideoPlayer  │      │     ShakaPlayer         │
│                     │      │                         │
│  - ExoPlayer (And)  │      │  - Proxy via Edge Fn    │
│  - AVPlayer (iOS)   │      │  - HLS.js fallback      │
│  - Direkt HTTP      │      │  - Mixed Content fix    │
│  - Ingen CORS       │      │                         │
│  - MPEG-TS native   │      │                         │
└─────────────────────┘      └─────────────────────────┘
         │                              │
         │                              │
         ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────┐
│  RAW IPTV STREAM    │      │  PROXIED HTTPS STREAM   │
│  http://IP/live/... │      │  stream-proxy?url=...   │
└─────────────────────┘      └─────────────────────────┘
```

---

## Fördelar med Denna Approach

1. **Samma kodbas** – React-appen fungerar på webb OCH som native app
2. **Native prestanda** – ExoPlayer/AVPlayer är industristandard för IPTV
3. **Inga proxy-problem** – Native-appen spelar strömmar direkt
4. **App Store-ready** – Kan publiceras på Google Play och App Store
5. **Offline-kapacitet** – Kan lägga till nedladdning av innehåll senare

---

## Filer att Skapa/Ändra

### Nya filer:
1. `capacitor.config.ts` – Capacitor-konfiguration
2. `src/components/player/NativeVideoPlayer.tsx` – Native player wrapper
3. `src/hooks/useNativePlatform.tsx` – Hook för plattformsdetektering

### Uppdatera:
1. `src/components/player/PlayerManager.tsx` – Lägg till native-spelare
2. `src/lib/xtream-api.ts` – Skippa proxy i native-läge
3. `package.json` – Lägg till Capacitor-beroenden

---

## Tekniska Krav

- **iOS-utveckling:** Kräver Mac med Xcode installerat
- **Android-utveckling:** Kräver Android Studio
- **Testning:** Fysisk enhet rekommenderas för IPTV-strömmar

---

## Sammanfattning
Med Capacitor kan du behålla hela din nuvarande React-kodbas och lägga till ett tunt native-lager för videouppspelning. Detta ger dig det bästa av två världar: snabb webbutveckling med native IPTV-prestanda.

