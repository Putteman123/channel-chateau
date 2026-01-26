
# Felsökningsplan: Stream Startar Inte

## Sammanfattning av Problem

Efter analys av koden och loggarna har jag identifierat **fyra huvudproblem**:

1. **Fel spelare används på LiveTV-sidan** - `LiveTV.tsx` importerar `VideoPlayer` (Video.js) istället för `ShakaPlayer` (Shaka Player)
2. **Runtime-fel i Shaka Player** - "Cannot read properties of null (reading 'dataset')" uppstår vid UI-initiering
3. **Race condition** - `useNativePlayer` state uppdateras asynkront, men `initPlayer` kan köras innan staten är redo
4. **IPTV-leverantören blockerar** - Edge function-loggar visar att HTTPS-anslutningar vägras (`ECONNREFUSED`) och HTTP returnerar ibland `458`

---

## Steg 1: Uppdatera LiveTV.tsx att Använda ShakaPlayer

LiveTV-sidan använder fortfarande den gamla `VideoPlayer`-komponenten.

**Ändringar:**
- Byt import från `VideoPlayer` till `ShakaPlayer`
- Uppdatera typen `StreamHttpHeaders` att importeras från rätt fil
- Byt alla `<VideoPlayer>` instanser till `<ShakaPlayer>`

---

## Steg 2: Fixa Race Condition i ShakaPlayer

Problemet med "Cannot read properties of null (reading 'dataset')" orsakas av att `shaka.ui.Overlay` initieras innan DOM-elementen är tillgängliga.

**Ändringar:**
- Flytta `shouldUseNativePlayer`-kontrollen **utanför** `useEffect` till en synkron initial beräkning med `useMemo`
- Säkerställ att `initPlayer` inte körs om `useNativePlayer` är true
- Lägg till extra null-kontroller och defensive checks i `initPlayer`
- Använd en `isMounted` ref för att förhindra state-uppdateringar efter avmontering

---

## Steg 3: Förbättra Proxy-Fallback-Logik

Edge function-loggarna visar att leverantören:
- Vägrar HTTPS-anslutningar (`ECONNREFUSED`)
- Ibland returnerar `HTTP 458` (blockering)
- **Fungerar ibland** med HTTP

**Ändringar:**
- Uppdatera `stream-proxy` att prioritera HTTP för live-strömmar (många IPTV-leverantörer stöder inte HTTPS)
- Lägg till bättre felmeddelanden som förklarar vad HTTP 458 betyder
- Lägg till retry-logik med längre timeouts för instabila leverantörer

---

## Steg 4: Lägg till Diagnostik för Källbyte

För att underlätta debugging vid byte mellan källor:
- Lägg till console.log när aktiv källa byts
- Validera att credentials laddas korrekt efter källbyte

---

## Tekniska Detaljer

### ShakaPlayer.tsx Ändringar

```typescript
// FÖRE: Race condition med async state
useEffect(() => {
  const shouldUseNative = shouldUseNativePlayer(src);
  setUseNativePlayer(shouldUseNative);
}, [src]);

// EFTER: Synkron beräkning med useMemo
const useNativePlayer = useMemo(() => shouldUseNativePlayer(src), [src]);

// Och i initPlayer:
const initPlayer = useCallback(async () => {
  // Extra defensive checks
  if (useNativePlayer) return;
  if (!videoRef.current || !containerRef.current) {
    console.warn('[ShakaPlayer] Refs not ready, skipping init');
    return;
  }
  // ... resten av initieringen
}, [useNativePlayer, effectiveSrc, ...]);
```

### LiveTV.tsx Ändringar

```typescript
// FÖRE
import { VideoPlayer, StreamHttpHeaders } from '@/components/player/VideoPlayer';

// EFTER  
import { ShakaPlayer, StreamHttpHeaders } from '@/components/player/ShakaPlayer';

// Och i JSX:
<ShakaPlayer
  src={getStreamUrl(playingChannel)}
  originalStreamUrl={getOriginalStreamUrl(playingChannel)}
  title={playingChannel.name}
  poster={playingChannel.stream_icon}
  httpHeaders={getHttpHeaders(playingChannel)}
  onClose={() => setPlayingChannel(null)}
/>
```

---

## Filer som Behöver Ändras

| Fil | Ändring |
|-----|---------|
| `src/pages/LiveTV.tsx` | Byt `VideoPlayer` till `ShakaPlayer` |
| `src/components/player/ShakaPlayer.tsx` | Fixa race condition med `useMemo`, lägg till defensive checks |
| `supabase/functions/stream-proxy/index.ts` | Prioritera HTTP för live-strömmar, förbättra felmeddelanden |

---

## Förväntat Resultat

Efter dessa ändringar:
1. LiveTV använder Shaka Player med industristandard HLS-stöd
2. "dataset is null"-felet försvinner tack vare defensive checks
3. Strömmar har bättre chans att fungera med HTTP-fallback
4. Bättre felmeddelanden hjälper användaren förstå problem

