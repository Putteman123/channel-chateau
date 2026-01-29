
# Plan: Fixa Token-format och MITM Proxy för Fungerande Strömmar

## Problemanalys

Jag har identifierat **orsaken** till att spelaren inte fungerar trots att "Testa proxy-nedladdning" visar en fungerande ström:

### Token-format är FEL

**Din fungerande URL:**
```
http://185.245.0.183/live/play/UjNScU5Fd3dUbE0yVGxaSVVUZDZPR2xQY1M5dlNHdGlNRnBPTW5Fdk1VaEJUWGxrU1VrdlZseEVaejA9/79662
```

**Token som fungerar:** `UjNScU5Fd3dUbE0yVGxaSVVUZDZPR2xQY1M5dlNHdGlNRnBPTW5Fdk1VaEJUWGxrU1VrdlZseEVaejA9`

**Token som appen genererar:** `MWM4NTg2MWJhNS8xOTRjZGNhMTg4YzY=` (vilket är `base64(1c85861ba5/194cdca188c6)`)

Leverantören använder en **dubbel base64-kodning** som ser ut att vara en hash av användaruppgifterna, inte bara `base64(username/password)`.

### Servern varierar också

Den fungerande URL:en använder IP-adressen `185.245.0.183` direkt - inte `line.myox.me`. Detta tyder på att IPTV-leverantören har flera servrar och den token som fungerar är bunden till en specifik server-IP.

## Lösningsförslag

Eftersom tokenet är genererat av leverantören (troligen via en autentiserings-API eller initial redirect), och vi inte kan återskapa det själva, är bästa lösningen att:

### Alternativ A: Fånga Token från Ursprunglig Redirect (Rekommenderad)

1. **Använd standard Xtream-formatet först** (`/live/username/password/streamid.ts`)
2. **Stream-proxyn följer redirecten** och fångar den riktiga URL:en med token
3. **Proxyn streamar från den slutliga IP-adressen** - detta fungerar redan!

**Problem:** Proxyn får en 503 på den initiala URL:en. Vi behöver testa med `.ts`-format istället för Player API.

### Alternativ B: Testa Original Xtream Format (Enklare)

Istället för att använda `/live/play/{token}/` formatet, testa med standard Xtream:
```
http://line.myox.me/live/1c85861ba5/194cdca188c6/79662.ts
```

Detta kan trigga en 302 redirect till den fungerande IP-adressen som proxyn sedan följer.

## Teknisk Implementation

### 1. Uppdatera `buildLiveStreamUrl` i `src/lib/xtream-api.ts`

Inaktivera Player API-formatet temporärt och använd standard Xtream-format:

```typescript
export function buildLiveStreamUrl(
  creds: XtreamCredentials, 
  streamId: number, 
  options: { useProxy?: boolean; preferTs?: boolean; forceHttp?: boolean; usePlayerApi?: boolean } = {}
): string {
  const { useProxy = true, preferTs = true, forceHttp = true, usePlayerApi = false } = options;
  // ^^^ Sätt usePlayerApi = false som default
  
  // ... resten av logiken använder standard /live/username/password/streamid.ts
}
```

### 2. Verifiera att stream-proxy följer redirects korrekt

Kontrollera att `redirect: 'follow'` verkligen följer 302-redirects till den slutliga IP-adressen.

### 3. Lägg till diagnostik-loggning i proxyn

Logga den slutliga URL:en efter redirect för att se om vi når rätt server.

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/lib/xtream-api.ts` | Sätt `usePlayerApi = false` som default, använd standard `.ts` format |
| `supabase/functions/stream-proxy/index.ts` | Förbättra loggning av redirect-kedjan |

## Alternativ Om Detta Inte Fungerar

Om standard-formatet också returnerar 503/458:

1. **Externt Token-API**: Vissa leverantörer har en `/get_token`-endpoint som returnerar det korrekta tokenet
2. **Manuell Token-input**: Låt användaren ange den fungerande URL:en direkt (copy/paste från "Testa proxy-nedladdning")
3. **Direct IP Mode**: Låt användaren konfigurera server-IP (`185.245.0.183`) separat från DNS-namnet

## Sammanfattning

Det huvudsakliga problemet är att **Player API-tokenet genereras fel** av vår kod. Lösningen är att:

1. **Först testa** med standard Xtream-format (`.ts`-filer) via proxyn
2. Proxyn följer redan redirects - det bör fungera om ursprungsförfrågan lyckas
3. Om det fortfarande misslyckas behöver vi undersöka leverantörens token-generering
