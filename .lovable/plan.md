
# Plan: Uppgradering av startsidan och prestanda

## 1. Ta bort IPTV-org spellistan fran alla anvandare
- Kor en DELETE-query mot `stream_sources`-tabellen for att ta bort alla rader med `m3u_url LIKE '%iptv-org%'`
- Ta bort eventuell logik i `handle_new_user()` trigger som automatiskt laggar till denna kalla (bekraftat att den INTE finns i triggern - kallorna lades till manuellt)

## 2. Forbattra laddningshastighet vid uppstart
- Oka `staleTime` i Browse.tsx fran 30 minuter till 3 dagar (259200000 ms) for alla queries (kanaler, filmer, serier)
- Ga direkt till cachad data utan bakgrunds-API-anrop om cachen ar giltig (under 3 dagar gammal)
- Skippa bakgrundsuppdatering vid uppstart om cache finns och ar frarsk

## 3. Uppdatera spellistor var tredje dag
- Andra `CACHE_EXPIRY_MS` i `local-cache.ts` fran 7 dagar till 3 dagar (259200000 ms)
- Anpassa `useSyncEngine` sa att fullstandig synkronisering bara triggas om cachen ar aldre an 3 dagar
- Delta sync kors bara vid manuell uppdatering (tryck pa "Uppdatera"-knappen) eller om cachen ar aldre an 3 dagar

## 4. Google-inloggning
- Konfigurera Google OAuth via Lovable Cloud (anvander den hanterade losningen - inget externt konto behovs)
- Lagg till en "Logga in med Google"-knapp i `AuthForm.tsx`
- Anvander `lovable.auth.signInWithOAuth("google", ...)` fran `@lovable.dev/cloud-auth-js`

## 5. Perplexity-integration: Topp 10 filmer och serier
- Koppla Perplexity-connectorn till projektet
- Skapa en edge function `perplexity-trending` som anropar Perplexity API for att hamta aktuella topp 10 filmer och topp 10 serier med strukturerad JSON-output
- Skapa en React-hook `useTrendingContent` som anropar edge-funktionen med 24h cachning
- Lagg till en ny sektion pa Browse-sidan ("Trending just nu") som visar dessa med posters (via TMDB)

## 6. Uppdatera Browse-sidans layout
Den nya ordningen pa startsidan blir:
1. Snabbstatistik (kanaler, filmer, serier)
2. Fortsatt titta (senast sedda)
3. Trending just nu - Topp 10 Filmer (fran Perplexity)
4. Trending just nu - Topp 10 Serier (fran Perplexity)
5. Live TV-kanaler
6. Favoriter
7. Populara filmer (fran kallan)
8. Nyligen tillagda
9. Populara serier (fran kallan)

---

## Tekniska detaljer

### Databasandringar
- `DELETE FROM stream_sources WHERE m3u_url LIKE '%iptv-org%'` (dataoperation, inte migration)

### Nya filer
- `supabase/functions/perplexity-trending/index.ts` - Edge function som anropar Perplexity med prompt "List the top 10 most popular movies and top 10 most popular TV series right now" med JSON schema
- `src/hooks/useTrendingContent.tsx` - Hook for att hamta och cacha trendande innehall

### Andrade filer
- `capacitor.config.ts` - Redan andrad (server block utkommenterad)
- `src/lib/local-cache.ts` - Andra CACHE_EXPIRY_MS till 3 dagar
- `src/pages/Browse.tsx` - Oka staleTime, lagg till trending-sektioner, optimera cache-logik
- `src/hooks/useSyncEngine.tsx` - Synka bara var 3:e dag
- `src/components/auth/AuthForm.tsx` - Lagg till Google-inloggningsknapp
- `supabase/config.toml` - Lagg till verify_jwt = false for perplexity-trending

### Beroenden
- Perplexity-connectorn maste kopplas till projektet forst
- Google OAuth konfigureras via configure-social-auth-verktyget
