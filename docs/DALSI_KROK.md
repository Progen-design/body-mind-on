# Další krok pro Claude Code

Aktuální zadání. Pořadí: **5.9, pak 1c.** Jeden bod na jednu session, po
dokončení `/clear`.

## Pravidla, která platí nade vším

**Kredity docházejí.** 28. 8. padlo přes 20 $ za den. Proto:

- **Neměř produkci.** Žádné `supabase db dump`, žádné parsery nad produkčními
  daty, žádné dotazy do DB kvůli číslům. Čísla dostaneš hotová. Ty píšeš kód.
- **Nečti soubory celé**, když stačí `grep` na konkrétní řádek.
- **Model je Sonnet** (`.claude/settings.json`). Opus jen když si o něj
  výslovně řekneš a zdůvodníš proč.

Ostatní beze změny: bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná
mock data, žádný Next.js, jeden zdroj pravdy, `lib/` je čisté JS
s explicitními `.js` importy. Po každém bodu diff a čekej na „schvaluji".

---

## 5.9 ZAMČENÝ DALŠÍ TÝDEN A CHECKOUT DO SPA

**Honza schválil 28. 8.** Tohle je jediná věc mezi produktem a penězi.

Dnes člověku po konci trialu svítí starý propadlý plán bez označení a nemá
kde zaplatit. Nula ze tří trialů konvertovala.

### Co udělat

1. **Vygenerovat další týden i pro trial** a uložit ho jako zamčený.
   `api/generate-plan-next-week.js` už existuje, není napojený a používá
   jinou bránu, která trial pouští. Napoj ho.
   Recepty stojí nulu — plán se skládá z katalogu, `OPENAI_PLAN_ENABLED`
   je `false`.

2. **Paywall do SPA.** Čtyři komponenty leží v `_legacy-next/`, které je
   ve `.vercelignore`. Převezmi z nich, co jde; SPA dnes `plan_state` vůbec
   nečte.
   Zamčený týden musí být **vidět** — konkrétní jídla, konkrétní čísla —
   a přes něj paywall. Člověk kupuje to, co má před očima.

3. **Varování před koncem trialu.** Dnes štítek tvrdí „AKTIVNÍ" až do
   posledního dne (`src/data/adaptery.ts:642`: `'trial' → AKTIVNÍ`).
   Musí být vidět, kolik dní zbývá.

4. **Cesta k zaplacení.** Ověř, že endpoint pro Stripe checkout session je
   nasazený a funkční — 13. 8. proběhla ostrá platba, takže existovat má.

Brány `start_trial_allows_initial_plan_only` v `planGenerationGate.js:69`
a `planRenewalRules.js:100` se nemění — přidává se vedle nich cesta na
zamčený plán, ne obcházení té stávající. Obě držet v souladu, UI čte
`planRenewalRules`.

---

## 1c ZRUŠIT STROP NA POČET SUROVIN

**Honza schválil 28. 8.** včetně upřesnění:

- Zrušit `count_main_ingredients > 10` v `enforce_recipe_catalog_rules`
  **i ve sweeperu**. Obě místa — jinak sweeper vrátí, co brána vypne.
- **Časový limit beze změny.**
- **Nový limit na počet kroků nezavádět** — data ho neopodstatňují.
- Dietní brána, alergeny, lepek, kalorické pásmo a trefa do maker se NEMĚNÍ.

Pravidlo z 25. 8.: „hodně jídel, jednoduchých, rychlých; je mi jedno,
z kolika surovin."

---

## Co čeká za tím

**4.9 bod 2** — dologovat `zadano` vedle `vraceno` do `ai_runs.result`, aby
šlo změřit, kolik receptů se od modelu opravdu žádá. Teprve podle toho sahat
na prompt.

**4.11** — doplnit 44 surovin, které blokují `gluten_free`. Watchdog
`surovina_blokuje_dietni_tag` je vypisuje.
