
# Plan: Fixa Proxy Fallback - Cloudflare-domänen svarar inte

## Problemanalys

Din Cloudflare-domän `line.premiumvinted.se` returnerar **ERR_CONNECTION_REFUSED**. Detta betyder att:
- DNS-uppsättningen kan vara fel
- Cloudflare Worker/Route är inte konfigurerad
- Eller domänen har gått offline

Appen är hårdkodad att använda denna domän utan någon fallback-logik.

## Lösning

Vi behöver göra appen mer robust genom att:
1. **Falla tillbaka till Supabase-URL** om Cloudflare-domänen inte fungerar
2. **Testa domänen vid uppstart** och välja rätt proxy automatiskt
3. **Ge användaren möjlighet att välja** proxy-domän i inställningar

## Tekniska ändringar

### 1. `src/lib/proxy-config.ts` - Lägg till automatisk fallback

```typescript
// Supabase fallback URL (always works)
export const SUPABASE_PROXY_URL = import.meta.env.VITE_SUPABASE_URL 
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stream-proxy`
  : '';

// Custom domain (may not always be available)
export const CUSTOM_PROXY_DOMAIN = 'https://line.premiumvinted.se';

// Cache for domain availability
let customDomainAvailable: boolean | null = null;

// Test if custom domain is reachable
export async function testCustomDomain(): Promise<boolean> {
  if (customDomainAvailable !== null) return customDomainAvailable;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(
      `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`,
      { method: 'HEAD', signal: controller.signal }
    );
    clearTimeout(timeout);
    
    customDomainAvailable = response.ok || response.status === 400; // 400 = missing url param = working
    return customDomainAvailable;
  } catch {
    customDomainAvailable = false;
    return false;
  }
}

// Get working proxy URL with automatic fallback
export async function getWorkingProxyBaseUrl(): Promise<string> {
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN) {
    const isAvailable = await testCustomDomain();
    if (isAvailable) {
      return `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`;
    }
    console.warn('[proxy-config] Custom domain unavailable, falling back to Supabase');
  }
  return SUPABASE_PROXY_URL;
}

// Sync version for immediate use (uses cached result or Supabase)
export function getProxyBaseUrl(): string {
  if (USE_CUSTOM_PROXY && CUSTOM_PROXY_DOMAIN && customDomainAvailable === true) {
    return `${CUSTOM_PROXY_DOMAIN}/functions/v1/stream-proxy`;
  }
  return SUPABASE_PROXY_URL;
}
```

### 2. `supabase/functions/stream-proxy/index.ts` - Dynamisk proxy-domän

Ändra den hårdkodade `CUSTOM_PROXY_DOMAIN` till att använda `req.url` origin:

```typescript
// Dynamically determine proxy domain from request
const requestUrl = new URL(req.url);
const proxyBase = `${requestUrl.origin}/functions/v1/stream-proxy`;
```

Detta gör att oavsett vilken domän som anropas (Cloudflare eller Supabase), kommer segment-URL:er att gå via samma domän.

### 3. Frontend - Testa proxy vid sidladdning

I `App.tsx` eller `StreamContext`, lägg till:

```typescript
useEffect(() => {
  // Pre-test proxy availability
  testCustomDomain().then(available => {
    console.log('[App] Custom proxy domain available:', available);
  });
}, []);
```

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/lib/proxy-config.ts` | Lägg till fallback-logik och domain-test |
| `supabase/functions/stream-proxy/index.ts` | Använd dynamisk domän från request URL |
| `src/App.tsx` eller `src/contexts/StreamContext.tsx` | Testa proxy vid uppstart |

## Alternativ: Snabb fix (enklaste lösningen)

Om Cloudflare-domänen inte behövs just nu, kan vi helt enkelt **stänga av den anpassade domänen**:

```typescript
// proxy-config.ts
export const USE_CUSTOM_PROXY = false; // <-- Ändra till false
```

Detta gör att alla anrop går via Supabase direkt, som alltid fungerar.

## Rekommendation

**Snabbaste lösningen**: Stäng av `USE_CUSTOM_PROXY` tills Cloudflare-domänen är korrekt konfigurerad.

**Långsiktigt robust**: Implementera automatisk fallback så appen fungerar oavsett domänstatus.
