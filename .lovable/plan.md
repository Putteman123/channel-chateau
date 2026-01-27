

# Plan: Fixa Proxy-konfiguration & Server URL

## Problemsammanfattning

Diagnostikpanelen visar:
- **URL:** `http://line.premiumvinted.se/live/.../79892.ts`
- **Proxy:** `Ja` (falskt positiv)

Problemet är att `server_url` i databasen är satt till **proxy-domänen** (`https://line.premiumvinted.se`) istället för den riktiga IPTV-servern (t.ex. `http://line.myox.me`).

## Rotorsak

Databasinnehåll:
```
server_url: https://line.premiumvinted.se (FEL!)
```

Detta gör att koden bygger URL:er som:
```
http://line.premiumvinted.se/live/username/password/79892.ts
```

Istället för att wrappa den riktiga strömmen via proxyn:
```
https://line.premiumvinted.se/functions/v1/stream-proxy?url=http://line.myox.me/live/.../79892.m3u8
```

## Lösning i två steg

### Steg 1: Uppdatera server_url i databasen

Du måste ändra `server_url` till din riktiga IPTV-servers adress. Baserat på tidigare loggar verkar den vara `http://line.myox.me`.

**Åtgärd:** Gå till **Inställningar → Källor**, klicka på pennikonen för att redigera din källa, och ändra:

| Fält | Nuvarande (fel) | Korrekt |
|------|-----------------|---------|
| Server URL | `https://line.premiumvinted.se` | `http://line.myox.me` (din riktiga IPTV-server) |

### Steg 2: Förbättra kodvalidering (valfritt men rekommenderat)

Lägg till validering i Sources.tsx för att varna användaren om de försöker spara proxy-domänen som server_url.

**Ändringar i `src/pages/settings/Sources.tsx`:**

```typescript
// Lägg till i xtreamSchema (rad 31-36)
const xtreamSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(50),
  server_url: z.string()
    .min(1, 'Server URL krävs')
    .refine(
      (url) => !url.includes('line.premiumvinted.se'), 
      'Ange din IPTV-servers URL, inte proxy-domänen (line.premiumvinted.se)'
    ),
  username: z.string().min(1, 'Användarnamn krävs'),
  password: z.string().min(1, 'Lösenord krävs'),
});
```

**Ändringar i `src/lib/xtream-api.ts`:**

Förbättra felmeddelandet i `buildLiveStreamUrl()` (rad 239-244) för att returnera ett mer informativt fel:

```typescript
// Rad 239-244 - Förbättra felmeddelande och returnera fallback
const isServerAlreadyProxy = CUSTOM_PROXY_DOMAIN && base.includes(new URL(CUSTOM_PROXY_DOMAIN).hostname);
if (isServerAlreadyProxy) {
  console.error('[XtreamAPI] ❌ server_url är satt till proxy-domänen!');
  console.error('[XtreamAPI] Din server_url:', base);
  console.error('[XtreamAPI] Gå till Inställningar → Källor och ändra till din riktiga IPTV-server');
  // Returnera en placeholder-URL för bättre feldiagnostik
  return `error://server_url_is_proxy_domain`;
}
```

**Ändringar i `src/components/player/ShakaPlayer.tsx`:**

Lägg till detektering av fel-URL:en i diagnostik:

```typescript
// I diagnostik-effekten, lägg till check för felaktig konfiguration
const isConfigError = effectiveSrc === 'error://server_url_is_proxy_domain' || 
                      effectiveSrc.startsWith('error://');

// I diagnostik-UI, visa tydligt felmeddelande
{isConfigError && (
  <p className="text-destructive font-semibold">
    ⚠️ Konfigurationsfel: Ändra server_url i Inställningar → Källor
  </p>
)}
```

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/pages/settings/Sources.tsx` | Lägg till validering för att förhindra proxy-domän som server_url |
| `src/lib/xtream-api.ts` | Förbättra felmeddelande och returnera diagnostisk URL |
| `src/components/player/ShakaPlayer.tsx` | Visa tydligt konfigurationsfel i diagnostik |

## Dataflöde efter fix

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          KORREKT KONFIGURATION                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Databas: server_url = "http://line.myox.me"                        │
│        │                                                            │
│        └─> buildLiveStreamUrl(creds, 79892, {useProxy: true})       │
│                 │                                                   │
│                 ├─> base = "http://line.myox.me"                    │
│                 │                                                   │
│                 └─> directUrl = "http://line.myox.me/live/.../79892.ts"
│                           │                                         │
│                           └─> proxyStreamUrl(directUrl, {preferM3u8: true})
│                                      │                              │
│                                      ├─> Konvertera .ts → .m3u8     │
│                                      │                              │
│                                      └─> Returnerar:                │
│                                          https://line.premiumvinted.se/
│                                          functions/v1/stream-proxy?url=
│                                          http://line.myox.me/.../79892.m3u8
│                                                 ✅ FUNGERAR!        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Förväntat resultat

Efter att du uppdaterat server_url i databasen ska diagnostikpanelen visa:

```text
Proxy Route: line.premiumvinted.se ✓ Cloudflare

URL: https://line.premiumvinted.se/functions/v1/stream-proxy?url=http%3A%2F%2Fline.myox.me%2Flive%2F...%2F79892.m3u8

Typ: HLS (.m3u8)

Proxy: Ja ✅

Protokoll: Sida: https / Ström: https
```

## Åtgärdsprioritet

1. **KRITISKT:** Uppdatera server_url i databasen manuellt
2. **Rekommenderat:** Implementera kodförbättringar för att förhindra samma misstag i framtiden

