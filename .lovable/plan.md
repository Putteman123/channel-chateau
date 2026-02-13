

# Fix: Ogiltigt App ID i Capacitor-konfigurationen

## Problem
App ID:t `app.lovable.75dc2d8aa96b483cb6655c65c33f188b` är ogiltigt eftersom det sista segmentet (`75dc2d8aa96b483cb6655c65c33f188b`) börjar med en siffra. Android och iOS kräver att varje segment i ett App ID börjar med en bokstav.

## Lösning
Uppdatera `capacitor.config.ts` och ändra `appId` till ett giltigt format genom att lägga till ett prefix med en bokstav före det sista segmentet.

**Nytt App ID:** `app.lovable.a75dc2d8aa96b483cb6655c65c33f188b`

## Fil som ändras
- `capacitor.config.ts` — ändra raden `appId` från:
  `app.lovable.75dc2d8aa96b483cb6655c65c33f188b`
  till:
  `app.lovable.a75dc2d8aa96b483cb6655c65c33f188b`

## Efter ändringen
Kör dessa kommandon igen lokalt:
1. `git pull` (för att hämta den uppdaterade filen)
2. `npx cap add android`
3. `npm run build`
4. `npx cap sync`

