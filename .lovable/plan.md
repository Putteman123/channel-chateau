
# Plan: Implementera bildproxy via Supabase Edge Function

## Problemanalys

Bilderna (kanalloggor, filmposters, serieomslag) laddas direkt fran IPTV-leverantorens HTTP-servrar. Eftersom appen kors over HTTPS, blockeras HTTP-bilder av webblasarens **Mixed Content**-policy. Detta resulterar i trasiga bilder eller helt saknade bilder.

Exempel pa problematiska URL:er:
- `http://line.premiumvinted.se/images/channel_logo.png`
- `http://provider.example/poster.jpg`

## Losningsstrategi

Vi atervander befintliga `stream-proxy` Edge Function for att aven hantera bildforfragan. Ingen ny edge function behovs - vi behover bara uppdatera klientsidan for att anvanda proxyn for bilder.

---

## Tekniska andringar

### Steg 1: Skapa bildproxy-funktion i `stream-utils.ts`

Lagg till en ny funktion som genererar proxy-URL for bilder:

```typescript
/**
 * Generate a proxy URL for images to bypass Mixed Content issues
 */
export function getImageProxyUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  
  // Don't proxy if already HTTPS or local
  if (imageUrl.startsWith('https://') || imageUrl.startsWith('/')) {
    return imageUrl;
  }
  
  // Don't proxy if already proxied
  if (isProxiedUrl(imageUrl)) {
    return imageUrl;
  }
  
  // Check if we need to proxy (HTTP on HTTPS page)
  if (!hasMixedContentIssue(imageUrl)) {
    return imageUrl;
  }
  
  const proxyBase = `${SUPABASE_URL}/functions/v1/stream-proxy`;
  return `${proxyBase}?url=${encodeURIComponent(imageUrl)}`;
}
```

### Steg 2: Uppdatera `LazyImage.tsx`

Importera och anvand bildproxyn:

```typescript
import { getImageProxyUrl } from '@/lib/stream-utils';

// I komponenten:
const effectiveSrc = useMemo(() => {
  if (!src) return fallback;
  return getImageProxyUrl(src);
}, [src, fallback]);

// Anvand effectiveSrc istallet for displaySrc
```

### Steg 3: Uppdatera `ChannelCard.tsx`

Kanalkortet anvander `<img>` direkt utan `LazyImage`. Vi behover antingen:
- Byta till `LazyImage`-komponenten, eller
- Importera och anvanda `getImageProxyUrl` direkt

```typescript
import { getImageProxyUrl } from '@/lib/stream-utils';

// I JSX:
<img
  src={getImageProxyUrl(channel.stream_icon)}
  alt={channel.name}
  ...
/>
```

### Steg 4: Uppdatera `LiveTV.tsx` (listvy)

Listvyn anvander ocksa `<img>` direkt:

```typescript
import { getImageProxyUrl } from '@/lib/stream-utils';

// I list-item JSX:
<img
  src={getImageProxyUrl(channel.stream_icon)}
  alt={channel.name}
  ...
/>
```

### Steg 5: Uppdatera `stream-proxy` Edge Function (valfritt)

Edge function stoder redan bildforfragan, men vi kan optimera den for bilder genom att:
- Lagga till cache-headers for bilder
- Detektera bildformat och satta ratt Content-Type

```typescript
// Lagg till bildformatdetektering
const isImage = contentType.includes('image') || 
                decodedUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i);

if (isImage) {
  // Langre cache for bilder
  responseHeaders["Cache-Control"] = "max-age=86400"; // 24 timmar
}
```

---

## Filer att andra

| Fil | Andring |
|-----|---------|
| `src/lib/stream-utils.ts` | Lagg till `getImageProxyUrl()` funktion |
| `src/components/content/LazyImage.tsx` | Anvand `getImageProxyUrl` for alla bilder |
| `src/components/epg/ChannelCard.tsx` | Anvand `getImageProxyUrl` for kanalloggor |
| `src/pages/LiveTV.tsx` | Anvand `getImageProxyUrl` i listvyn |
| `supabase/functions/stream-proxy/index.ts` | (Valfritt) Optimera cache for bilder |

---

## Forvantat resultat

- Alla bilder (kanalloggor, filmposters, serieomslag) laddas via HTTPS-proxyn
- Inga Mixed Content-varningar i webblasaren
- Bilder visas korrekt i alla vyer (grid och lista)
- Cache-headers optimerar laddningstider vid upprepade besok

---

## Testning

1. Oppna Live TV-sidan
2. Verifiera att kanalloggor visas i bade grid- och listvy
3. Oppna Movies-sidan och verifiera filmposters
4. Oppna Series-sidan och verifiera serieomslag
5. Kontrollera Network-fliken i DevTools att bilderna gar via `stream-proxy`
