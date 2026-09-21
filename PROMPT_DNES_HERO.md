# Nová horní část „Dnes": hero „Tvůj den"

Honza schválil vizuální návrh 20. 9. (Design canvas „BMON hlavní obrazovka", artboardy
„Dnes · desktop" a „Dnes · mobil 390 px"). Tohle zadání ho převádí do kódu.

**Větev:** založ `feat/dnes-hero` z aktuálního `main` (doladění z `PROMPT_UX_DOLADENI.md` už je v něm). Necommituj, nepushuj, neotvírej PR. Migraci napiš jako soubor, **nepouštěj ji** — pouštím ji já.

## Proč

Horní karta (`ProfilHlavicka`) dnes zabírá nejlepší místo na obrazovce údaji, které
nikdo denně nepotřebuje: e-mail, „Člen od", věk, výška, „Přihlášen". Hlavní obrazovka
má za dvě vteřiny říct *jak jsem na tom dnes a co mám udělat teď*. Vzor: MyFitnessPal
„Today" (kalorie a makra nahoře, pod tím jídla), Whoop/Oura (denní stav nahoře),
Apple Fitness (kroužky).

## Cílová struktura sekce Dnes (shora dolů)

1. **Hero „Tvůj den"** — nahrazuje `ProfilHlavicka` na záložce Dnes:
   - řádek kontextu: den v týdnu + datum · „Den N tvého programu" · štítek TRIAL · X DNÍ
     (N = dny od `created_at`, počítané v Europe/Prague, den registrace = Den 1)
   - pozdrav podle denní doby (Dobré ráno do 10:00 / Dobrý den do 17:00 / Dobrý večer),
     s oslovením — viz „Oslovení" níž
   - jedna věta o stavu dne, skládaná z dat (ne AI): trénink dnes / volno + kolik jídel
     zbývá zapsat. Příklady: „Dnes máš volno. Zbývá zapsat 5 jídel." /
     „Dnes tě čeká Trénink B. Zapsáno 2 z 5 jídel."
   - **tři ukazatele**:
     - *Jídlo*: kroužek, snědeno / cíl kcal (stejné číslo jako teď v „Dnešek" —
       z `/api/stats/adherence`, nevymýšlet vlastní výpočet)
     - *Trénink*: dnes název + délka, nebo „Volno" + nejbližší další trénink
       („zítra A · 60 min"); po odcvičení „Hotovo"
     - *Váha*: aktuální, cíl, zbývá; pruh pokroku = (start − aktuální) / (start − cíl),
       kde **start = první záznam** z `weightRecords` (`naVazeni`), aktuální = poslední.
       Méně než 2 záznamy nebo žádný cíl → pruh se NEkreslí, jen čísla.
       Nabírání (cíl > start) musí fungovat taky.
   - **Další krok** — JEDNA primární akce podle stavu, pevné pořadí pravidel:
     1. trénink dnes a neodcvičený → „Začít trénink {název}" → záložka Trénink
     2. první nezapsané jídlo, jehož čas už nastal → „Zapiš {typ} — {název}" →
        odškrtne to jídlo (stejná akce jako zaškrtávátko v seznamu)
     3. dnes ještě není vážení a je ráno → „Zapiš dnešní váhu" → stávající modál váhy
     4. všechno hotovo → žádné tlačítko, jen „Dnešek máš splněný." (nevymýšlet úkol)
     Pravidla jako čistá funkce v `src/lib/`, s unit testem na každou větev.
2. **Řádek TED** — jedna zpráva z existujících `coachTips` (`naZpravyTrenera`, první
   aktuální) + tlačítko „Zeptat se" (otevře `CoachChatModal`). **Žádné nové volání
   OpenAI** — na úvodní obrazovce by to stálo peníze při každém načtení. Bez zprávy
   se řádek neukazuje.
3. **Jídla dnes** — z `DnesniPrehled`, v podobě z doladění (celý řádek klikací).
   Nadpis „Jídla dnes", vpravo makra dne. Blok kcal/makra z DnesniPrehled, který teď
   dělá hero, odstranit — nechceme to číslo dvakrát.
4. Zbytek beze změny pořadí: Jak ti dnešek seděl → Nákupní seznam → Tvůj další týden →
   Propojená zařízení → Účet a předplatné.
5. **Pruh trialu** (`TrialCountdownStrip`) — přesunout pod „Jídla dnes", text
   „Za X dní končí zkušební období. Plán na další týden už je připravený." a tlačítko
   „Co získám s členstvím" (scroll na nabídku v Účtu, jako teď).

## Co z hlavičky zmizí a kam

E-mail, „Člen od", věk, výška, „Přihlášen" → do Účtu (sekce Účet a předplatné, nová
karta „Profil" nad Předplatným) a do menu pod avatarem vpravo nahoře. **Nic se nemaže,
jen stěhuje.** „Upravit cíle" zůstává dostupné — v Účtu i z ukazatele Váha.
Na ostatních záložkách (Tělo, Jídelníček, Trénink, Spánek) `ProfilHlavicka` nech,
jak je — tohle mění jen Dnes.

## Oslovení

Pozdrav „Dobrý večer, Honzo" potřebuje 5. pád. Automatické skloňování jmen chybuje
(Honza → Honzo zvládne, ale příjmení, cizí a zdrobnělá jména ne), proto:
- nové volitelné pole **„Jak ti máme říkat?"** v nastavení profilu, uložené na serveru
- migrace: sloupec na tabulce, kde je dnes jméno uživatele (najdi sám), `text null`,
  max 40 znaků; soubor do `supabase/migrations/`, **nepouštět**
- dokud pole není vyplněné: pozdrav **bez jména** („Dobrý večer.") — nikdy křestní
  jméno v 1. pádě („Dobrý večer, Jan" je česky špatně)
- na profilu jednou nenápadná výzva „Jak ti máme říkat?" s inputem; po uložení zmizí

## Vzhled

Podle canvasu: hero je výrazná karta (tmavě tyrkysový okraj), tři ukazatele vpravo na
desktopu, na mobilu v řádku po třech pod pozdravem, „Další krok" jako karta
s tyrkysovým tlačítkem. Používej existující design tokeny (`lib/designTokens.js`,
`src/index.css`), žádné nové barvy natvrdo. Kroužky jako inline SVG, žádná nová
knihovna na grafy.

Mobil 390 px: nic nesmí horizontálně přetékat, názvy se nesmí useknout na jeden
řádek, dotykové cíle ≥ 44 px.

## Přístupnost

Kroužky mají `aria-label` se skutečnou hodnotou („Snědeno 0 z 2 537 kcal").
„Další krok" je `<button>`, ne klikací div.

## Testy

- čistá funkce „Další krok" — všechny 4 větve + den bez plánu
- výpočet pokroku váhy — hubnutí, nabírání, < 2 záznamy, chybějící cíl
- Den N programu přes půlnoc v Europe/Prague
- pozdrav bez oslovení nikdy neobsahuje křestní jméno
- nový test v `test:src`, zapsaný v `package.json`

## Ověření

`npm run check` exit 0. Nepiš „ověřeno v prohlížeči", pokud jsi ho neotevřel —
vizuální kontrolu na produkci dělám já.

## Výstup

Co jsi změnil po bodech 1–5, co se přestěhovalo z hlavičky a kam, název migrace
a co přesně dělá, seznam testů. Co jsi NEudělal a proč.
