
# Plan: Förbättra Stream Proxy Headers & Diagnostik

## Sammanfattning

Diagnostiken visar att proxyn är korrekt konfigurerad men videon laddas inte. Det mest troliga problemet är att IPTV-leverantören blockerar anrop från datacenter-IP:er (Supabase/Cloudflare), oavsett vilken User-Agent som skickas.

Men vi kan göra flera förbättringar för att:
1. Prova fler User-Agent-varianter
2. Förbättra Content-Type-hantering
3. Lägga till en "Testa Proxy"-länk för enkel felsökning

## Teknisk analys

### Nuvarande status i `stream-proxy/index.ts`:
- Använder redan `VLC/3.0.20 LibVLC/3.0.20` som User-Agent (rad 77)
- Har redan `Accept: */*` och `Connection: keep-alive` (rad 78-80)
- Sätter korrekt `Content-Type: application/vnd.apple.mpegurl` för m3u8 (rad 248)

### Föreslagna förbättringar:

## Ändringar

### 1. `supabase/functions/stream-proxy/index.ts`

**Förbättra User-Agent till "IPTV Smarters Pro"** (mer populär app bland leverantörer):

```typescript
// Rad 76-81 - Byt standard User-Agent
const fetchHeaders: Record<string, string> = {
  "User-Agent": customUserAgent || "IPTV Smarters Pro/3.0.9",
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
};
```

**Förbättra Content-Type för .ts-segment** (rad 270-275):

```typescript
// Säkerställ korrekt Content-Type för video-segment
let finalContentType = contentType;
if (decodedUrl.endsWith('.ts') || decodedUrl.includes('.ts?')) {
  finalContentType = 'video/mp2t';
} else if (decodedUrl.includes('.m3u8')) {
  finalContentType = 'application/vnd.apple.mpegurl';
}
```

### 2. `src/components/player/ShakaPlayer.tsx`

**Lägg till "Testa Proxy-nedladdning"-länk** i diagnostik-panelen (efter rad 874):

```typescript
{/* Test proxy download link */}
{diagnostics.isProxied && effectiveSrc && (
  <p className="mt-2">
    <a 
      href={effectiveSrc}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline hover:no-underline"
    >
      🔗 Testa Proxy-nedladdning
    </a>
    <span className="ml-2 text-muted-foreground">
      (Öppnas i ny flik - bör ladda ner textfil)
    </span>
  </p>
)}
```

### 3. Alternativ: Lägg till flera User-Agents att prova

Skapa en lista med populära User-Agents som proxyn kan rotera mellan vid fel:

```typescript
const USER_AGENTS = [
  "IPTV Smarters Pro/3.0.9",
  "VLC/3.0.20 LibVLC/3.0.20", 
  "Kodi/20.0 (Windows 10; AMD64)",
  "TiviMate/4.6.0",
];
```

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/stream-proxy/index.ts` | Ändra User-Agent till "IPTV Smarters Pro", förbättra Content-Type-hantering |
| `src/components/player/ShakaPlayer.tsx` | Lägg till "Testa Proxy-nedladdning"-länk i diagnostik-panelen |

## Viktigt att notera

Om IPTV-leverantören blockerar **alla** datacenter-IP:er (Supabase, Cloudflare, AWS, etc.) så spelar User-Agent ingen roll. I sådana fall är den enda lösningen att:

1. Öppna strömmen i VLC/MPV på din lokala dator (använder din hem-IP)
2. Kontakta IPTV-leverantören för att be om ett undantag

"Testa Proxy-nedladdning"-länken kommer hjälpa dig att se exakt vad proxyn returnerar - om det är en spellista (text) eller ett felmeddelande.

## Förväntat resultat

Efter ändringarna:
- Proxyn använder "IPTV Smarters Pro" User-Agent som är mer trolig att accepteras
- Content-Type sätts korrekt för både m3u8 och ts-filer
- Diagnostik-panelen har en klickbar länk för att testa proxyn direkt
