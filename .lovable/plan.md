
# Plan: Fixa Port-konflikt i URL (Ta bort :80 vid HTTPS)

## Problemanalys

**Rotorsak identifierad:** I `LiveTV.tsx` rad 128-130 används `URL.origin` för att ersätta domänen med VPN-tunneln. Men `URL.origin` normaliserar bort standardportar (80 för HTTP, 443 för HTTPS), medan den ursprungliga URL-strängen behåller `:80` explicit.

**Exempel:**
```javascript
const streamUrl = 'http://line.trxdnscloud.ru:80/live/user/pass/123.m3u8';
const urlObj = new URL(streamUrl);

console.log(urlObj.origin);  // 'http://line.trxdnscloud.ru' (UTAN :80!)
console.log(streamUrl.replace(urlObj.origin, 'https://vpn.premiumvinted.se'));
// → 'https://vpn.premiumvinted.se:80/live/user/pass/123.m3u8' (FEL! :80 kvar)
```

**Resultat:** URL:en blir `https://vpn.premiumvinted.se:80/...` vilket är ogiltigt (HTTPS på port 80).

---

## Lösning

Använd `urlObj.pathname + urlObj.search` istället för att ersätta origin. Detta extraherar endast path och query-parametrar, utan host eller port.

**Alternativt:** Städa bort portnummer efter domänbytet med regex.

---

## Ändringar

### Fil 1: `src/pages/LiveTV.tsx`

**Rad 120-147** - Uppdatera `getStreamUrl` funktionen:

```typescript
const getStreamUrl = useCallback((channel: UnifiedChannel) => {
  // For M3U channels, use the original stream_url and route through Cloudflare tunnel
  if ('stream_url' in channel && channel.stream_url) {
    let streamUrl = channel.stream_url;
    
    // Route through Cloudflare tunnel if HTTP (for Mixed Content protection)
    if (streamUrl.startsWith('http://')) {
      try {
        const urlObj = new URL(streamUrl);
        // FIXED: Use pathname + search to avoid port conflict
        // URL.origin doesn't include explicit :80, but the original string might
        const path = urlObj.pathname + urlObj.search;
        streamUrl = `https://vpn.premiumvinted.se${path}`;
      } catch {
        // If URL parsing fails, use proxy function as fallback
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        return `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(streamUrl)}`;
      }
    }
    
    return streamUrl;
  }
  // ... rest unchanged
}, [credentials, preferTsLive, forceHttpLive, useProxy]);
```

**Förändring:** Istället för `streamUrl.replace(urlObj.origin, ...)` byggs nu URL:en korrekt med:
```typescript
const path = urlObj.pathname + urlObj.search;
streamUrl = `https://vpn.premiumvinted.se${path}`;
```

---

### Verifiering

Efter ändringen:

| Input | Före (Fel) | Efter (Rätt) |
|-------|-----------|--------------|
| `http://server.com:80/live/123.m3u8` | `https://vpn...:80/live/123.m3u8` | `https://vpn.../live/123.m3u8` |
| `http://server.com/live/123.m3u8` | `https://vpn.../live/123.m3u8` | `https://vpn.../live/123.m3u8` |
| `http://server.com:8080/live/123.m3u8` | `https://vpn...:8080/live/123.m3u8` | `https://vpn.../live/123.m3u8` |

---

## Teknisk sammanfattning

- **1 fil** att ändra: `src/pages/LiveTV.tsx`
- **3 rader** att modifiera (rad 128-130)
- Använder samma approach som redan finns i `src/lib/cloudflare-rewrite.ts` (`extractPath` funktionen)
- Inga nya beroenden
