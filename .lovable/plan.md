
# Plan: Fixa streaming genom att hantera leverantörsblockering

## Problem sammanfattning

Analysen visar att streaming misslyckas på grund av **två sammanlänkade problem**:

1. **Mixed Content-blockering**: Webbläsaren på HTTPS kan inte ladda HTTP-strömmar direkt
2. **Leverantörsblockering (HTTP 458)**: IPTV-leverantören blockerar aktivt vår proxy-server eftersom den körs på en datacenter-IP

Edge function-loggarna visar:
```
[stream-proxy] HTTP 458 from: http://line.premiumvinted.se/live/...
[stream-proxy] All URLs failed. Last error: HTTP 458
```

Och konsol-loggarna visar:
```
[ShakaPlayer] Effective URL: http://line.premiumvinted.se/...309562.m3u8
[ShakaPlayer] Load error: Shaka Error 1002 "Failed to fetch"
```

---

## Lösningsstrategi

Eftersom leverantören blockerar proxy-anslutningar måste vi ge användaren tydliga alternativ:

### Steg 1: Förbättra felhantering och användarfeedback

Uppdatera ShakaPlayer för att:
- Detektera HTTP 458-fel specifikt
- Visa tydligt meddelande: "Din IPTV-leverantör blockerar proxy-uppspelning"
- Ge direkt tillgång till "Öppna i VLC"-knappen vid blockering

### Steg 2: Bypass proxy-alternativ

Skapa ett läge där strömmen går direkt utan proxy:
- Lägg till "Använd ej proxy" toggle per källa (redan finns: `use_proxy`)
- Dokumentera att detta kräver att användaren öppnar i VLC/extern spelare

### Steg 3: Automatiskt fallback till extern spelare

När HTTP 458 eller nätverksfel detekteras:
1. Visa felinformation med kod
2. Erbjud "Öppna i VLC" som primärt alternativ
3. Visa "Kopiera direktlänk" för användning i andra appar

### Steg 4: Testa direkt uppspelning för .ts-format

Vissa leverantörer blockerar .m3u8 men tillåter .ts:
- Uppdatera logiken för att testa .ts-format om .m3u8 misslyckas
- Edge function har redan prioritering av .ts men vi behöver säkerställa att det används

---

## Tekniska ändringar

### Fil: `src/components/player/ShakaPlayer.tsx`

Förbättra diagnos av HTTP 458:

```typescript
// I diagnoseError funktionen, lägg till:
if (errorMessage?.includes('458') || 
    errorDetails?.httpStatus === 458) {
  return {
    type: 'network',
    message: 'Leverantören blockerar proxy-uppspelning',
    details: 'Din IPTV-leverantör tillåter inte uppspelning via vår proxy. ' +
             'Använd VLC eller annan extern spelare istället.',
    code: errorCode,
    httpStatus: 458,
  };
}
```

Lägg till bättre "Öppna i VLC"-UI vid blockering:

```typescript
// När playerError.httpStatus === 458, visa prominent VLC-knapp
{playerError?.httpStatus === 458 && (
  <div className="mt-4 flex flex-col gap-2">
    <p className="text-yellow-400">Rekommenderad lösning:</p>
    <Button onClick={() => window.open(buildExternalPlayerUrl(externalUrl, 'vlc'))}>
      Öppna i VLC
    </Button>
  </div>
)}
```

### Fil: `supabase/functions/stream-proxy/index.ts`

Returnera 458-status i response för bättre klient-detektion:

```typescript
// I error-hanteringen:
return new Response(
  JSON.stringify({ 
    error: "Provider blocking",
    httpStatus: 458,
    hint: "Din IPTV-leverantör blockerar datacenter-IP. Öppna i VLC.",
  }),
  { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

### Fil: `src/lib/xtream-api.ts`

Säkerställ att .ts-format används när proxy är aktivt:

```typescript
// I buildLiveStreamUrl:
// Nuvarande logik är korrekt - preferTs: true som default
// Men vi behöver säkerställa att forceHttp + useProxy kombinationen fungerar
```

---

## Användarflöde efter fix

1. Användare startar kanal
2. Shaka Player försöker spela via proxy
3. **Om HTTP 458:**
   - Tydligt felmeddelande visas
   - "Öppna i VLC" knapp framträdande
   - Användaren kan kopiera direktlänk
4. **Om annat nätverksfel:**
   - Retry-logik aktiveras (max 3 försök)
   - Fallback till externt spelare-alternativ

---

## Begränsningar

**Viktigt att förstå:** Denna IPTV-leverantör blockerar aktivt datacenter-IP:er. Det finns ingen teknisk lösning som kan kringgå detta i en webbläsare. Alternativen är:

1. **Extern spelare (VLC/MPV)** - Fungerar eftersom det körs lokalt på användarens dator/IP
2. **Inbyggd app** - En desktop/mobil-app som körs på användarens nätverk
3. **VPN på användarens enhet** - Om leverantören tillåter VPN-IP:er

---

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/components/player/ShakaPlayer.tsx` | Förbättra 458-detektion och VLC-fallback |
| `supabase/functions/stream-proxy/index.ts` | Returnera tydlig 458-status |
| `src/lib/xtream-api.ts` | Verifiera .ts prioritering vid proxy |

---

## Förväntat resultat

- Tydlig feedback när leverantören blockerar
- Enkel åtkomst till VLC/extern spelare
- Användaren förstår varför uppspelning misslyckas
- Ingen förvirrande retry-loop vid blockering
