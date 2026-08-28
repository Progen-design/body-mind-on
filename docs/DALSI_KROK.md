# Další krok pro Claude Code

Aktuální zadání. Honza tenhle soubor otevře a řekne „udělej, co je
v `docs/DALSI_KROK.md`". Nic jiného rozepsaného není.

## Pravidla, která teď platí nade vším

**Kredity docházejí.** 28. 8. padlo přes 20 $ za den. Proto:

- **Neměř produkci.** Žádné `supabase db dump`, žádné parsery nad produkčními
  daty, žádné dotazy do DB kvůli číslům. Čísla ti dodám hotová. Ty píšeš kód.
- **Jeden bod na jednu session.** Po dokončení bodu `/clear`.
- **Nečti soubory celé**, když stačí `grep` na konkrétní řádek.
- **Model je Sonnet** (nastaveno v `.claude/settings.json`). Opus jen když si
  o něj výslovně řekneš a zdůvodníš proč.

Ostatní pravidla beze změny: bez dat žádný závěr, `null` je „—" a nikdy `0`,
žádná mock data, žádný Next.js, jeden zdroj pravdy, `lib/` je čisté JS
s explicitními `.js` importy. Po každém bodu diff a čekej na „schvaluji".

---

## 5.9 V SPA NENÍ PAYWALL ANI CHECKOUT

**Nejvyšší priorita.** Tohle je důvod, proč 0 ze 3 trialů konvertovalo — ne
plán, ne katalog. Není kde zaplatit.

Ověřeno grepem přes celý `src/`: jediná zmínka o členství je
`src/data/adaptery.ts:642` — štítek `'active' → AKTIVNÍ`, `'trial' → AKTIVNÍ`,
jinak `PAUZOVÁNO`. Žádný paywall, žádné tlačítko zaplatit, žádný odkaz na
checkout. `TrialExpiredPaywall`, `PlanLockedPaywall` a `TrialEndingSoonBanner`
zůstaly ve starém Next.js appu a do Bento SPA se nepřenesly.

### Nejdřív nález, pak čekej na schválení

1. Kde ty staré komponenty jsou a co uměly. Jde je převzít, nebo psát znovu?
2. Jaký endpoint zakládá Stripe checkout session a je nasazený? 13. 8.
   proběhla ostrá platba, takže někde být má.
3. Co dnes uvidí uživatel s prošlým trialem, obrazovku po obrazovce.
4. Co uvidí uživatel, kterému trial končí za dva dny. Dnes mu štítek tvrdí
   „AKTIVNÍ" a nikde nestojí, že končí — to je taky chyba.

Zjisti to **z kódu**, ne z produkce.

### Podklad, ať to nemusíš měřit

- Plán se skládá z katalogu, `OPENAI_PLAN_ENABLED` je `false`. Vygenerovat
  další týden stojí prakticky nula, takže zamčený týden pod paywallem je levný.
- Brána `start_trial_allows_initial_plan_only` pouští trialu jen `initial_plan`.
  Je to záměr, ne chyba. Zatím na ni nesahej.
- Účty k 28. 8.: 1 platící (`active`), 3 trialy — všem trial skončil a plán
  jim skončil den před tím nebo dřív. Nula konverzí.

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
