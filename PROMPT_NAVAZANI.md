# Navázání po restartu — stav k 21. 9. 2026 večer

Přečti celé, než cokoli změníš. Pravidla platí dál: **necommituj, nepushuj, neotvírej
PR, migrace nepouštěj** — commit, PR, merge, migrace a ověření na produkci dělá Claude
(Cowork) po review.

## Co je hotové a v produkci

- #242 úklid bran kvality (CI == `npm run check`)
- #243 náklady OpenAI — jediný chokepoint `volejModel()` v `lib/openai.js`
- #244 sekce Dnes přerovnaná, prodej nahoře (pruh) a dole v Účtu
- #245 kaloricky vědomý picker + 22 nových šablon
- #246 celý řádek jídla otevírá recept, pravdivé texty v nabídce
- web #6 (repo `bodyandmindon-web`) — návyky nahrazeny AI trenérem TED

## Co je rozdělané — NESAHAT bez pokynu

- **Větev `feat/dnes-hero`, PR #247** — hero „Tvůj den" (`DnesHero`, `RadekTeda`,
  `src/lib/dalsiKrok.ts` …). Review hotové, opravy z review jsou už v commitu
  `838cf18` (nová větev „ceka" v `dalsiKrok`, 4. pád „Zapiš snídani").
  **Čeká na migraci** `supabase/migrations/20260921090000_jak_ti_mame_rikat.sql`
  (sloupec `profiles.preferred_address`) — `api/profile.js` ho čte, takže PR se
  nesmí mergnout dřív. Tuhle větev neměň, pokud o to Honza výslovně nepožádá.
- V `bodyandmindon-web` leží necommitnuté změny v `app/faq/page.tsx`,
  `components/faq-accordion.tsx`, `components/weight-chart.tsx` — nejsou z naší
  práce, nesahej na ně.

## Mimo kód (víš o tom, ale neřešíš)

- OpenAI API vrací `429 You have no credits remaining` (od 19. 9.) — TED a generátor
  receptů stojí, dokud Honza nedobije kredit. Neobcházej to v kódu.
- 3 testovací účty `info+stripe-preview-*` / `info+restore-verify-*` v produkci —
  maže Honza přes `npm run admin:cleanup-stripe-preview-users`.

## Než začneš novou práci

1. `git checkout main && git pull` — nová práce vždy z aktuálního `main`, na nové
   větvi `feat/<krátký-popis>`.
2. Zadání dostaneš od Honzy v další zprávě. Když je nejasné, zeptej se, nehádej.
3. Na konci: `npm run check` exit 0 a výpis, co jsi změnil, co jsi NEudělal a proč.
