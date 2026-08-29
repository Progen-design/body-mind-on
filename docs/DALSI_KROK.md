# Další krok pro Claude Code

## Pravidla, která platí nade vším

- **Neměř produkci.** Žádné dotazy do DB, žádné Vercel MCP, žádné volání
  produkčních endpointů. Čísla dostaneš hotová.
- **Nikdy `supabase db push` ani `apply_migration`.** Repo a
  `schema_migrations` jsou od 23. 8. rozejité.
- **Jeden bod na jednu session.** Po dokončení `/clear`.
- **Model Sonnet.** Eslint na `src/` nespouštěj, repo ho tam nemá.
- Bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná mock data, žádný
  Next.js, jeden zdroj pravdy.
- Konec = diff a čekání na „schvaluji". Necommituj sám.

---

## 5.9c UKÁZKA SE GENERUJE DO MINULOSTI

Změřeno dry-runem produkčního cronu 29. 8., `zamcene_ukazky` vrátilo
3 kandidáty:

```
20bb0050  od 2026-08-10  do 2026-08-16   <- 19 dnu v minulosti
e487293e  od 2026-08-25  do 2026-08-31   <- zacina v minulosti
20d99b80  od 2026-08-28  do 2026-09-03   <- v poradku
```

Příčina je v `lib/zamcenyTydenPlanu.js`: `od = poDnech(konec, 1)`, tedy
ukázka vždy navazuje na poslední den posledního plánu — bez ohledu na to,
jak dávno ten plán skončil. Komu plán dojel 9. 8., tomu se dnes vyrobí
„další týden" na 10.–16. 8.

Paywall by pak tvrdil „Tvůj další týden je připravený" a ukazoval týden,
který je 19 dní starý. To neprodá nic; spíš to prodej zabije.

### Co změnit

V `najdiKandidatyNaUkazku()` počítat začátek jako **pozdější ze dvou dat**:
den po konci posledního plánu, a dnešek. Nikdy dřív než dnes.

```
const od = konec >= dnes ? poDnech(konec, 1) : dnes;
```

`do` zůstává `poDnech(od, 6)`.

Pozor na kontrolu duplicity o pár řádků níž — `maUkazkuOd.get(...) === od`
porovnává datum začátku. Po téhle změně se `od` u propadlých trialů mění
každý den, takže by se ukázka vyráběla znovu a znovu. Podmínku předělat na
„už má JAKOUKOLI nepropadlou ukázku" — tedy existuje řádek s `locked` a
`valid_until >= dnes`. To je jediná verze, která se sama neopakuje.

### Testy

Do `lib/` testové sady (najdi, kam patří — vzor podle sousedních modulů)
přidat případy nad `najdiKandidatyNaUkazku` s podvrženým klientem:

- plán skončil před 19 dny → `od` je dnešek, ne den po konci plánu
- plán končí za 2 dny → `od` je den po konci plánu
- už má ukázku s `valid_until` v budoucnu → kandidát nevzniká
- už má ukázku, která propadla → kandidát vzniká znovu

### Verifikace

`npm run test:src`, `npx tsc --noEmit`, `npm run lint:copy`.

---

## Za tím

Audit stránky Profil — plán a čísla jsou v `docs/AUDIT_PROFILU.md`,
postupuje se shora dolů po sekcích. Zadání pro každou sekci přijde sem.
