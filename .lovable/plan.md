
# Plan: Konfigurera Streaming via Custom Domain (Cloudflare)

## Sammanfattning

Du har konfigurerat en egen domän `https://line.premiumvinted.se` via Cloudflare som proxar trafik till din Supabase Edge Function. Detta ger korrekt SSL-stöd och löser Mixed Content-problemet.

Vi ska uppdatera applikationen så att all streamingtrafik (video + bilder) går via denna nya domän istället för den direkta Supabase-URL:en.

---

## Tekniska ändringar

### Steg 1: Skapa konfigurationsfil för proxy-domän

Skapa en ny konfigurationsfil för att centralisera proxy-inställningar:

```text
Fil: src/lib/proxy-config.ts
```

```typescript
/**
 * Proxy Configuration
 * Configure custom domain for stream proxying via Cloudflare
 */

// Custom Cloudflare domain for proxying streams
// Falls back to Supabase URL if not set
export const CUSTOM_PROXY_DOMAIN = 'https://line.premiumvinted.se';

// Whether to use custom domain or default Supabase
export const USE_CUSTOM_PROXY = true;

// Build the proxy base URL
export function getProxyBaseUrl(): string {
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN) {
    return `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`;
  }
  
  // Fallback to Supabase URL
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl}/functions/v1/stream-proxy` : '';
}

// Get the domain name for display purposes
export function getProxyDomainName(): string {
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN) {
    return new URL(CUSTOM_PROXY_DOMAIN).hostname;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return supabaseUrl ? new URL(supabaseUrl).hostname : 'unknown';
}
```

---

### Steg 2: Uppdatera `stream-utils.ts`

Ersätt SUPABASE_URL med den nya konfigurationen:

```typescript
// Före:
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const proxyBase = `${SUPABASE_URL}/functions/v1/stream-proxy`;

// Efter:
import { getProxyBaseUrl } from './proxy-config';
const proxyBase = getProxyBaseUrl();
```

Uppdatera funktionerna:
- `getProxyUrl()` - Använd `getProxyBaseUrl()`
- `getImageProxyUrl()` - Använd `getProxyBaseUrl()`

---

### Steg 3: Uppdatera `xtream-api.ts`

Uppdatera `proxyStreamUrl()` funktionen:

```typescript
// Före:
function proxyStreamUrl(url: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(url)}`;
}

// Efter:
import { getProxyBaseUrl } from './proxy-config';

function proxyStreamUrl(url: string): string {
  const proxyBase = getProxyBaseUrl();
  if (!proxyBase) {
    console.warn('[XtreamAPI] No proxy URL configured');
    return url;
  }
  return `${proxyBase}?url=${encodeURIComponent(url)}`;
}
```

---

### Steg 4: Uppdatera `stream-proxy` Edge Function

Säkerställ att CORS tillåter trafik från din app:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",  // Tillåt alla för nu
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
```

Edge function strömmar redan data via `ReadableStream` (piping) så ingen buffring sker.

---

### Steg 5: Lägg till debug-indikator i ShakaPlayer

Visa proxy-rutt för admin/dev-mode:

```typescript
// I ShakaPlayer.tsx diagnostics-panelen:
{diagnostics && (
  <div className="text-xs text-muted-foreground">
    <p>Proxy Route: {getProxyDomainName()}</p>
    <p>Stream: {diagnostics.urlType}</p>
    {diagnostics.isProxied && <p className="text-green-500">✓ Proxied</p>}
  </div>
)}
```

---

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/lib/proxy-config.ts` | **NY** - Centraliserad proxy-konfiguration |
| `src/lib/stream-utils.ts` | Använd `getProxyBaseUrl()` istället för SUPABASE_URL |
| `src/lib/xtream-api.ts` | Använd `getProxyBaseUrl()` för stream proxy |
| `src/components/player/ShakaPlayer.tsx` | Lägg till proxy route i diagnostics |
| `supabase/functions/stream-proxy/index.ts` | Verifiera CORS-headers |

---

## Arkitekturdiagram

```text
┌──────────────────────────────────────────────────────────────────┐
│                        FÖRE (Mixed Content)                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Browser HTTPS]                                                 │
│       │                                                          │
│       ├──> https://qeeqaqsftdrtnlceqzcj.supabase.co/...          │
│       │         │                                                │
│       │         └──> http://iptv-provider/stream.m3u8            │
│       │                  ❌ Blocked by Mixed Content             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     EFTER (Cloudflare Proxy)                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Browser HTTPS]                                                 │
│       │                                                          │
│       └──> https://line.premiumvinted.se/functions/v1/stream-proxy
│                   │                                              │
│                   ├──> [Cloudflare CDN] (SSL + Caching)          │
│                   │         │                                    │
│                   │         └──> https://supabase.co/edge-fn     │
│                   │                    │                         │
│                   │                    └──> http://iptv-provider │
│                   │                              ✅ Fungerar!    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## .ts till .m3u8 konvertering

Logiken finns redan i `stream-utils.ts`:

```typescript
// convertTsToM3u8() - Konverterar .ts till .m3u8
// preferM3u8 option i getProxyUrl() använder detta

// Exempel:
// Input:  http://provider/live/user/pass/123.ts
// Output: http://provider/live/user/pass/123.m3u8
```

Denna logik aktiveras via `preferM3u8: true` i `getProxyUrl()`.

---

## Förväntat resultat

1. **Alla strömmar** går via `https://line.premiumvinted.se`
2. **Cloudflare** hanterar SSL-terminering
3. **Ingen Mixed Content** - allt är HTTPS
4. **Debug-info** visar "Proxy Route: line.premiumvinted.se" för admin
5. **Bilder** proxas också via samma domän

---

## Framtida förbättringar (valfritt)

- Lägg till `CUSTOM_PROXY_DOMAIN` som miljövariabel istället för hårdkodad
- Implementera fallback till Supabase om custom domain inte svarar
- Lägg till Cloudflare Workers för ytterligare optimering
