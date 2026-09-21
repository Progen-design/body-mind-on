# Další kroky před spuštěním — čtyři opravy v jednom zadání

**Začni až poté, co Honza napíše, že práce z `PROMPT_NAKLADY_MINIMUM.md` je
mergnutá.** Pak: `git checkout main && git pull` a nová větev `feat/pred-spustenim`.
Necommituj, nepushuj, neotvírej PR, migrace nepouštěj (soubor napiš, pouští je Claude).

## Šetři limit

Jen tyhle čtyři body, nic navíc. Čti jen soubory, které potřebuješ. `npm run check`
pusť jednou na konci. Když něco není jasné, zeptej se jednou větou.

---

## 1. Registrace START: `pending_payment` místo `trial` (NEJDŮLEŽITĚJŠÍ)

Test to hlásí jako pre-existující fail: `membershipFromRegistration('START', …)` vrací
`pending_payment`, dokumentace a migrace `start_registration_grants_7day_trial` říkají
`trial` s `trial_ends_at` (+7 dní).

- Zjisti, co se **dnes v produkci skutečně děje** při registraci START: kterou cestou
  jde nový uživatel a jaký stav dostane. Je to jen rozbitý test, nebo reálná chyba?
  Pokud reálná, nový uživatel by po registraci mohl mít zamčený plán místo 7 dní
  zdarma — to je u spuštění blokující.
- Oprav podle zjištění (kód, nebo test — ne obojí naslepo). Test musí být zelený a
  zařazený v `test:unit`.

## 2. Nákupní seznam sčítá stejnou surovinu dvakrát

„banán 135 g" a „banán 3 ks" jako dva řádky. Po tisku do PDF to bije do očí.

- Sjednoť jednotky u surovin, kde jde kus převést na gramy (banán, vejce, jablko,
  pečivo…). Použij existující `unit_conversions` / váhy kusu, pokud existují — nic
  nevymýšlej od oka; chybějící váhu kusu přidej se zdrojem v komentáři.
- Když převod neexistuje, nech dva řádky — radši dva poctivé řádky než špatný součet.
- Test na banán (g + ks → jeden řádek).

## 3. Návyky: přestat je zakládat

Záložka Návyky byla odstraněna, web je neslibuje, `habit_logs` je prázdná — ale
registrace je pořád zakládá (10 uživatelů má 41 návyků) a profil je nabízí k editaci.

- Registrace: návyky už nezakládat, výběr návyků z registrace odstranit.
- Profil / nastavení: editaci návyků odstranit.
- **Tabulky ani existující data NEMAZAT** — jen je přestat vytvářet a ukazovat.
  Mazání dat je samostatné rozhodnutí.
- Uprav testy, které návyky při registraci očekávají.

## 4. Dvě drobnosti v hero „Tvůj den" (ověřeno na produkci 21. 9.)

- Datum „Pondělí 21. **Září**" — česky měsíc malým písmenem: „Pondělí 21. září".
- Tlačítko „Začít trénink **Trénink A**" — slovo dvakrát. Když název tréninku
  začíná „Trénink", tlačítko má být „Začít Trénink A" (nebo „Začít trénink A").
  Uprav test v `src/lib/dalsiKrok.test.ts`.

---

## Výstup

Po bodech 1–4: co jsi zjistil, co jsi změnil, kterým testem je to hlídané. U bodu 1
výslovně: **byla to reálná chyba v produkci, nebo jen test?** Co jsi NEudělal a proč.
`npm run check` exit 0.
