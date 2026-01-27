
# Plan: Fixa Proxy-logik för Filmer

## Sammanfattning

Efter noggrann analys har jag hittat det verkliga problemet. **Proxyn gör redan korrekt piping** (inte redirect). Problemet är hur frontend avgör om proxyn ska användas för VOD-innehåll (filmer).

## Problemanalys

### Nuvarande status i `stream-proxy/index.ts`:
- Redan korrekt: Använder `new Response(response.body, ...)` (rad 292) - **INTE redirect**
- Redan korrekt: User-Agent är "IPTV Smarters Pro/3.0.9"
- Redan korrekt: Content-Type sätts korrekt för .ts och .m3u8

### Problem 1: `buildMovieStreamUrl` logik

I `src/lib/xtream-api.ts` (rad 277-288):

```typescript
// For VOD, we can optionally use .ts format when proxying
if (useProxy && shouldUseProxy(directUrl)) {  // <-- Problem här!
```

`shouldUseProxy(directUrl)` kontrollerar Mixed Content. Men om användaren har `useProxy: true` i inställningarna bör vi ALLTID proxya för att undvika CORS/buffering-problem - inte bara vid Mixed Content.

### Problem 2: Användarens inställning

Från network requests ser jag att användarens källa har `"use_proxy":false`. Detta måste vara aktiverat i inställningarna för att proxyn ska användas.

## Ändringar

### 1. `src/lib/xtream-api.ts` - Fixa proxy-logik för VOD

**Rad 277-288** - Ändra villkoret så att `useProxy: true` alltid triggar proxyn:

```typescript
// For VOD, use proxy if explicitly enabled OR if there's a Mixed Content issue
if (useProxy) {
  // Always use proxy when user has enabled it - handles CORS and buffering
  if (preferTs) {
    const tsUrl = `${base}/movie/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.ts`;
    console.log('[XtreamAPI] Using stream proxy (ts) for movie:', tsUrl.substring(0, 50) + '...');
    return proxyStreamUrl(tsUrl);
  }
  console.log('[XtreamAPI] Using stream proxy for movie:', directUrl.substring(0, 50) + '...');
  return proxyStreamUrl(directUrl);
}
```

**Samma ändring för `buildSeriesStreamUrl`** (rad 302-312).

### 2. `src/lib/xtream-api.ts` - Redan korrekt för Live

`buildLiveStreamUrl` (rad 259) gör redan rätt:
```typescript
if (useProxy) {  // Alltid om useProxy är true
  return proxyStreamUrl(directUrl, { preferM3u8: true });
}
```

### 3. Ingen ändring behövs i `stream-proxy/index.ts`

Proxyn är redan korrekt implementerad med piping. Inga ändringar behövs.

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/lib/xtream-api.ts` | Ändra `buildMovieStreamUrl` och `buildSeriesStreamUrl` för att alltid använda proxy när `useProxy: true` |

## Viktigt: Användaren måste aktivera proxyn

I **Inställningar -> Källor** måste användaren:
1. Redigera sin källa
2. Aktivera "Använd proxy" (för närvarande är den avstängd enligt `use_proxy: false`)

## Teknisk bakgrund

Proxyn gör redan korrekt "transparent tunnel":
- Hämtar strömmen med `fetch(targetUrl)`
- Sätter User-Agent: IPTV Smarters Pro
- Returnerar `new Response(response.body, ...)` - **pipar datan direkt**
- Sätter `Access-Control-Allow-Origin: *`
- Kopierar/fixar Content-Type

## Förväntat resultat

Efter ändringen:
- Filmer och serier kommer gå genom proxyn när `useProxy: true`
- Live TV fungerar redan korrekt
- Inga Mixed Content-fel oavsett protokoll
