
# Plan: Tvinga Proxy-användning & Fixa .TS-format

## Problemanalys

Baserat på debugloggen ser vi:
- **URL:** `http://line.myox.me/live/1c85861ba5/194cdca188c6/1069434.ts`
- **Proxy:** `Nej ⚠️`
- **Protokoll:** `Sida: https: / Ström: http`

Problemet är att spelaren får den råa HTTP-länken direkt, istället för att gå via proxyn. Detta beror på en bugg i `buildLiveStreamUrl()` i `xtream-api.ts` - funktionen kollar `shouldUseProxy(directUrl)` men denna check fungerar inte korrekt när `useProxy` redan är `true`.

## Rotorsak

I `xtream-api.ts` rad 252-258:
```typescript
if (useProxy) {
  // BUG: Duplicerad villkorslogik
  if (shouldUseProxy(directUrl) || useProxy) {
    return proxyStreamUrl(directUrl);
  }
}
```

Logiken är korrekt men **problemet är att `preferTs = true` skapar en `.ts`-URL, som sedan inte konverteras till `.m3u8` innan den proxas**.

## Lösning

### Steg 1: Uppdatera `proxyStreamUrl()` i `xtream-api.ts`

Modifiera funktionen att automatiskt konvertera `.ts` → `.m3u8` innan proxying:

```typescript
function proxyStreamUrl(url: string, options?: { preferM3u8?: boolean }): string {
  if (isProxiedUrl(url)) {
    return url;
  }
  
  const proxyBase = getProxyBaseUrl();
  if (!proxyBase) {
    console.warn('[XtreamAPI] No proxy URL configured');
    return url;
  }
  
  // Konvertera .ts till .m3u8 för bättre webbläsarkompatibilitet
  let urlToProxy = url;
  if (options?.preferM3u8 !== false && url.endsWith('.ts')) {
    urlToProxy = url.replace('.ts', '.m3u8');
    console.log('[XtreamAPI] Converting .ts → .m3u8:', urlToProxy);
  }
  
  const proxiedUrl = `${proxyBase}?url=${encodeURIComponent(urlToProxy)}`;
  console.log('[XtreamAPI] Original:', url);
  console.log('[XtreamAPI] Final Proxy URL:', proxiedUrl);
  return proxiedUrl;
}
```

### Steg 2: Förenkla `buildLiveStreamUrl()` 

Ta bort duplicerad logik och tvinga alltid proxy för externa strömmar:

```typescript
export function buildLiveStreamUrl(
  creds: XtreamCredentials, 
  streamId: number, 
  options: { useProxy?: boolean; preferTs?: boolean; forceHttp?: boolean } = {}
): string {
  const { useProxy = true, preferTs = true, forceHttp = false } = options;
  let base = buildBaseUrl(creds);
  
  // Varning om server_url är satt till vår proxy-domän
  const isServerAlreadyProxy = CUSTOM_PROXY_DOMAIN && 
    base.includes(new URL(CUSTOM_PROXY_DOMAIN).hostname);
  if (isServerAlreadyProxy) {
    console.error('[XtreamAPI] ❌ server_url är felaktigt inställd!');
    return '';
  }
  
  // Force HTTP om begärt
  if (forceHttp && base.startsWith('https://')) {
    base = base.replace('https://', 'http://');
  }
  
  // Bygg direkt-URL (alltid .ts från IPTV-servern)
  const extension = preferTs ? 'ts' : 'm3u8';
  const directUrl = `${base}/live/${creds.username}/${creds.password}/${streamId}.${extension}`;
  
  // ALLTID använd proxy om aktiverat (konverterar .ts → .m3u8)
  if (useProxy) {
    return proxyStreamUrl(directUrl, { preferM3u8: true });
  }
  
  return directUrl;
}
```

### Steg 3: Uppdatera `isProxiedUrl()` i `stream-utils.ts`

Förbättra detekteringen att verifiera korrekt proxy-format:

```typescript
export function isProxiedUrl(url: string): boolean {
  // Korrekt proxy-format: måste innehålla ?url= parameter
  const hasProxyPath = url.includes('/functions/v1/stream-proxy');
  const hasUrlParam = url.includes('?url=');
  
  // Fullständig proxy: path + parameter
  if (hasProxyPath && hasUrlParam) return true;
  
  // Custom domain med url-parameter
  const customDomain = 'line.premiumvinted.se';
  if (url.includes(customDomain) && hasUrlParam) return true;
  
  return false;
}
```

### Steg 4: Uppdatera diagnostik i `ShakaPlayer.tsx`

Fixa logiken som visar proxy-status:

```typescript
// Rad 284 - förbättrad isProxied-check
const isProxied = isProxiedUrl(effectiveSrc);

// Lägg till varning om URL är HTTP utan proxy
const hasMixedContent = !isProxied && 
  effectiveSrc.startsWith('http://') && 
  pageProtocol === 'https:';
```

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/lib/xtream-api.ts` | Uppdatera `proxyStreamUrl()` och `buildLiveStreamUrl()` |
| `src/lib/stream-utils.ts` | Förbättra `isProxiedUrl()` för korrekt format-check |
| `src/components/player/ShakaPlayer.tsx` | Uppdatera diagnostik för Mixed Content-varning |

## Förväntat resultat

Efter implementering ska debug-panelen visa:

```text
Proxy Route: line.premiumvinted.se ✓ Cloudflare

URL: https://line.premiumvinted.se/functions/v1/stream-proxy?url=http%3A%2F%2Fline.myox.me%2Flive%2F...%2F1069434.m3u8

Typ: HLS (.m3u8)

Proxy: Ja ✅

Protokoll: Sida: https / Ström: https
```

## Dataflöde efter fix

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          FÖRE (Fel)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ChannelPlayer.getStreamUrl()                                       │
│        │                                                            │
│        └─> buildLiveStreamUrl(useProxy=true)                        │
│                 │                                                   │
│                 └─> Returnerar: http://line.myox.me/.../1069434.ts  │
│                           │                                         │
│                           └─> ShakaPlayer försöker ladda HTTP       │
│                                      ❌ Mixed Content blockerar     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          EFTER (Korrekt)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ChannelPlayer.getStreamUrl()                                       │
│        │                                                            │
│        └─> buildLiveStreamUrl(useProxy=true)                        │
│                 │                                                   │
│                 └─> proxyStreamUrl(directUrl, {preferM3u8: true})   │
│                           │                                         │
│                           ├─> Konvertera .ts → .m3u8                │
│                           │                                         │
│                           └─> Returnerar:                           │
│                               https://line.premiumvinted.se/        │
│                               functions/v1/stream-proxy?url=        │
│                               http://line.myox.me/.../1069434.m3u8  │
│                                      ✅ Fungerar!                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```
