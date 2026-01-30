
# Plan: Integrera Direct IP Streaming med Hybrid Proxy-approach

## Sammanfattning
Strömmen via rå IP-adress (`http://185.245.0.183/live/play/.../79662`) fungerar i webbläsaren direkt men blockeras av Mixed Content i appen. Vi ska implementera en hybrid-approach där:
1. Cloudflare-tunnel används för kända domäner (line.myox.me)
2. Supabase Edge Function används för IP-adresser
3. Player API-format (`/live/play/{token}/{id}`) används utan filändelse

## Teknisk Bakgrund
Cloudflare DNS kan bara peka mot **en** IP-adress. När IPTV-leverantören använder olika backend-IP:er (t.ex. `185.245.0.183`) kan Cloudflare-tunneln inte dirigera dit. Supabase Edge Function fungerar som universell MITM-proxy för alla IP-adresser.

---

## Ändringar

### 1. Uppdatera `src/lib/cloudflare-rewrite.ts`
- Lägg till funktion `isIpAddress(url)` för att detektera rå IP-adresser
- Modifiera `convertToTunnel()` för att **hoppa över IP-adresser**
- Lägg till logik: "Om URL pekar mot IP → returnera oförändrad (ska gå via Edge Function)"

### 2. Uppdatera `src/lib/xtream-api.ts`
**Ny funktion `buildPlayerApiLiveUrl()`:**
- Format: `/live/play/{base64_token}/{stream_id}` (ingen filändelse)
- Token: `btoa(username + "/" + password)`

**Uppdatera `buildLiveStreamUrl()`:**
- **Fallback-logik:**
  1. Om standard Xtream-format → Cloudflare tunnel (för kända domäner)
  2. Om IP-adress → Supabase Edge Function proxy
- Lägg till option `usePlayerApiFormat: boolean`

**Ny funktion `tunnelOrProxyUrl()`:**
- Detekterar om URL är IP-adress eller domän
- IP → `stream-proxy?url=...`
- Domän → `vpn.premiumvinted.se/...`

### 3. Uppdatera `src/lib/stream-utils.ts`
- Lägg till `isIpAddressUrl(url)` helper
- Uppdatera `getPlaybackStrategy()` för att använda rätt proxy-metod

### 4. Uppdatera `src/components/player/ShakaPlayer.tsx`
- Uppdatera `diagnostics.connectionType` för att visa:
  - "Cloudflare Tunnel" (för domäner via vpn.premiumvinted.se)
  - "Edge Function Proxy" (för IP-adresser via stream-proxy)
- Visa faktisk server-IP i debug-panelen

### 5. Uppdatera `src/pages/ChannelPlayer.tsx`
- Använd `usePlayerApiFormat` option om standard-format misslyckar
- Fallback: testa Player API-format vid error

---

## Flödesdiagram (Ny Proxy-logik)

```text
┌─────────────────────────────────────────────────┐
│           Inkommande Ström-URL                   │
└─────────────────────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Är det en       │
              │  IP-adress?      │
              └──────────────────┘
                   │         │
                  JA        NEJ
                   │         │
                   ▼         ▼
    ┌───────────────────┐  ┌────────────────────┐
    │  Supabase Edge    │  │  Cloudflare Tunnel │
    │  Function Proxy   │  │  (vpn.premiumv...) │
    │                   │  │                    │
    │  stream-proxy?    │  │  Extrahera path    │
    │  url=http://IP/...│  │  och sätt på VPN   │
    └───────────────────┘  └────────────────────┘
                   │               │
                   └───────┬───────┘
                           ▼
                  ┌─────────────────┐
                  │  HTTPS Response │
                  │  till spelaren  │
                  └─────────────────┘
```

---

## Förväntade Resultat
1. **IP-baserade strömmar fungerar** via Edge Function proxy
2. **Domänbaserade strömmar** (line.myox.me) använder snabbare Cloudflare tunnel
3. **Player API-format** används automatiskt vid behov
4. **Debug-panel** visar korrekt anslutningstyp

---

## Tekniska Detaljer

### IP-adress Detektering
```typescript
function isIpAddress(url: string): boolean {
  const hostname = new URL(url).hostname;
  // IPv4: 185.245.0.183
  // IPv6: [::1]
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || 
         hostname.startsWith('[');
}
```

### Hybrid Proxy Funktion
```typescript
function getProxiedUrl(originalUrl: string): string {
  if (isIpAddress(originalUrl)) {
    // IP-adress → Edge Function (universell proxy)
    return `${SUPABASE_PROXY}?url=${encodeURIComponent(originalUrl)}`;
  } else {
    // Domän → Cloudflare tunnel (snabbare)
    return convertToTunnel(originalUrl);
  }
}
```

### Player API URL Builder
```typescript
function buildPlayerApiLiveUrl(creds, streamId): string {
  const token = btoa(`${creds.username}/${creds.password}`);
  const server = extractHostFromUrl(creds.serverUrl);
  // Ingen filändelse - servern returnerar HLS automatiskt
  return `http://${server}/live/play/${token}/${streamId}`;
}
```
