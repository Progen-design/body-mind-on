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

## 6.1 BEZLAKTÓZOVÝ UŽIVATEL DOSTAL MÁSLO

Změřeno v produkci 29. 8. Účet s `diet_type = 'lactose_free'` má v aktivním
plánu tento recept:

```
Pečené krevety s česnekovým máslem a špenátem
  krevety 200 g
  máslo 20 g        <- mlecny vyrobek
  cesnek 5 g, spenat 100 g, olivovy olej 10 g, citronova stava 10 ml
```

Zbytek jeho týdne je čistý. Propadlo jedno jídlo na obyčejném „máslo".

`lactose_free` se neřeší přes `diet_tags`, ale výhradně přes
`mealContainsExcludedFood()` nad `DAIRY_TERMS` (viz komentář v
`lib/dietOptions.js` a hlavička `lib/__tests__/dairyTerms.test.mjs`).
Co v `DAIRY_TERMS` chybí, propluje publikační bránou. Stejná chyba jako
feta a parmezán 14. 8. 2026.

### Co změnit

Doplnit do `DAIRY_TERMS` máslo a jeho české tvary tak, aby dál procházela
rostlinná másla. Pozor, tohle je celý vtip úkolu:

```
BLOKOVAT      máslo, máslem, másla, přepuštěné máslo, ghí
NEBLOKOVAT    arašídové máslo, mandlové máslo, kokosové máslo,
              kakaové máslo, peanut butter
```

Rozhodni se pro řešení, které nespoléhá na pořadí pravidel — seznam
povolených výjimek musí vyhrát nad blokujícím termínem bez ohledu na to,
v jakém pořadí se prochází.

### Testy

Rozšířit `lib/__tests__/dairyTerms.test.mjs` — struktura pro obojí tam už je:

- do `MLECNE` přidat `máslo`, `máslem`, `přepuštěné máslo`, `ghí`
  s odůvodněním „nález z 29. 8., recept Pečené krevety s česnekovým máslem"
- do `ROSTLINNE` ověřit, že `arašídové máslo`, `mandlové máslo`,
  `kokosové máslo`, `kakaové máslo` a `peanut butter` dál procházejí
- přidat případ na název jídla, ne jen na řádek suroviny — produkční nález
  byl v obou

### Verifikace

`npm run test:unit`, `npx tsc --noEmit`, `npm run lint:copy`.

---

## Za tím, v tomhle pořadí

**6.2 Reset stavu při změně přihlášeného uživatele.** Po registraci nového
účtu svítí v profilu data předchozího uživatele — váha, tělesný tuk, svalová
hmota, připojený Withings, odznak AKTIVNÍ místo TRIAL. Po `F5` je vše
správně, server tedy data neplete; SPA nezahodí stav starého uživatele.
Podrobnosti a naměřená tabulka v `docs/TEST_UI_REGISTRACE_2026-08-29.md`.

**6.3 Cena a délka zkušebního období do registrace.** V žádném z pěti kroků
nestojí, kolik program stojí a že trial trvá 7 dní. Nález z 3. 8., pořád
otevřený. U předplatného se zkušební dobou musí být cena uvedená předem.

**6.4 Interní názvy receptů vidí zákazník.** V plánech jsou položky jako
„Tuňák s pečivem — sytá svačina — XL" a „Vejce natvrdo s pečivem — XL".
Vypadá to jako omylem odhalená databáze, ne jako prémiový produkt.
