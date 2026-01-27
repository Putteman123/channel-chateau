# Plan: Bildproxy via Supabase Edge Function

## Status: ✅ IMPLEMENTERAD

Bildproxyn är nu aktiv. Alla HTTP-bilder (kanalloggor, filmposters, serieomslag) proxas automatiskt via `stream-proxy` Edge Function för att undvika Mixed Content-blockeringar.

## Implementerade ändringar

| Fil | Ändring |
|-----|---------|
| `src/lib/stream-utils.ts` | ✅ Lade till `getImageProxyUrl()` funktion |
| `src/components/content/LazyImage.tsx` | ✅ Använder `getImageProxyUrl` för alla bilder |
| `src/components/epg/ChannelCard.tsx` | ✅ Använder `getImageProxyUrl` för kanalloggor |
| `src/components/epg/EPGDrawer.tsx` | ✅ Använder `getImageProxyUrl` för kanalloggor |
| `src/pages/LiveTV.tsx` | ✅ Använder `getImageProxyUrl` i listvyn |
| `supabase/functions/stream-proxy/index.ts` | ✅ Optimerad cache för bilder (24h) |

## Resultat

- Alla HTTP-bilder laddas via HTTPS-proxyn
- Inga Mixed Content-varningar
- Bilder cachelagras i 24 timmar för bättre prestanda
