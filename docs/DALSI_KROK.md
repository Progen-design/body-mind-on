# Další krok pro Claude Code

## Pravidla, která platí nade vším

**Kredity docházejí.**

- **Neměř produkci.** Žádné `supabase db dump`, žádné dotazy do DB, žádné
  Vercel MCP. Čísla dostaneš hotová.
- **Nikdy `supabase db push` ani `apply_migration`.** Repo a
  `schema_migrations` jsou od 23. 8. rozejité — `db push` by znovu pustil
  14 už nasazených migrací. Migrace nasazuje Honzův druhý Claude.
- **Jeden bod na jednu session.** Po dokončení `/clear`.
- **Nečti soubory celé**, když stačí `grep` na konkrétní řádek.
- **Model je Sonnet.** Opus jen po výslovném zdůvodnění.
- Eslint na `src/` nespouštěj — repo ho tam nemá (`lint` cílí na `api lib`).

Ostatní beze změny: bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná mock
data, žádný Next.js, jeden zdroj pravdy, `lib/` je čisté JS s explicitními
`.js` importy.

---

## 5.9b NA PAYWALLU JEN TO, CO SE OPRAVDU PRODÁVÁ

Rozhodnutí Honzy z 29. 8.: **prodává se jen START.** ON Club a VIP až po
rozhodnutí, zatím se neprodávají.

Hotová část 5.9 vykresluje tři tlačítka. Dvě z nich server odmítne přes
`isTierCheckoutEnabled` a uživatel dostane „Připravujeme". Na obrazovce,
jejímž jediným úkolem je vzít peníze, je rozbité tlačítko horší než žádné.

### Co změnit

1. **`api/profile.js`** — do odpovědi přidat `dostupne_tiery`: pole těch
   z `['START','ON_CLUB','VIP']`, pro které `isTierCheckoutEnabled(tier)`
   (`lib/salesFeatureFlags.js`) vrací true. Žádný nový env, žádná druhá
   kopie logiky — server je jediný, kdo o zapnutí rozhoduje, klient se ptá.

2. **`src/data/adaptery.ts`** — přenést `dostupne_tiery` do `ZamcenyPlan`
   (a doplnit typ v `src/types.ts`). Když pole chybí nebo je prázdné,
   fallback `['START']`. Prázdný paywall je horší než špatný — nesmí
   vzniknout stav bez jediné cesty k platbě.

3. **`src/components/TrialPaywallCard.tsx`** — vykreslit jen tiery
   z `dostupne_tiery`. Ostatní neukazovat vůbec: ani zašedlé, ani
   s „Připravujeme". Při jediném dostupném tieru nesmí karta zůstat
   v třetinové mřížce — roztáhnout na plnou šířku.

4. **`src/data/adaptery.test.ts`** — dva testy: chybějící pole → `['START']`;
   `['START','ON_CLUB']` projde beze změny pořadí.

### Verifikace

`npm run test:src`, `npx tsc --noEmit`, `npm run lint:copy`.

**Necommituj.** Tohle jde do jednoho commitu s hotovou částí 5.9 — až po
výslovném „schvaluji".

---

## Co čeká za tím

**1c** — uvolnit strop na počet surovin. `countMainIngredients` odmítá 11+
hlavních surovin. Honzovo pravidlo z 25. 8.: „hodně jídel, jednoduchých,
rychlých; je mi jedno, z kolika surovin." Nahradit limitem na čas a počet
kroků. Dietní brána, alergeny, lepek a kalorické pásmo se NEMĚNÍ.

**4.9 bod 2** — dologovat `zadano` vedle `vraceno` do `ai_runs.result`, aby
šlo změřit, kolik receptů se od modelu opravdu žádá. Teprve podle toho sahat
na prompt.

**4.11** — doplnit 44 surovin, které blokují `gluten_free`. Watchdog
`surovina_blokuje_dietni_tag` je vypisuje.
