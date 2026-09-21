# PROMPT: Dnes = „wow" obrazovka (21. 9. 2026)

## Pravidla (platí celé)
- NEcommituj, NEpushuj, NEotvírej PR, NEspouštěj migrace. Migraci jen připrav jako soubor a napiš, že čeká na schválení.
- Žádné nové volání OpenAI. Všechno se staví z dat, která appka už má (profil, plán, jídla, tréninky, váha, coachTips).
- Žádná nová těžká knihovna (bundle má 598 kB). Grafy a kroužky = vlastní SVG, animace = `motion/react` (už v projektu).
- Texty česky a pravdivě: neslibuj nic, co appka neumí. Žádné zdravotní sliby.
- Mobil 390 px je primární, desktop 1440 px druhý. Na mobilu nic nesmí přetékat ani se useknout.
- Na konci `npm run check` musí projít. Přidej testy ke každé nové čisté funkci.

## Cíl
Kdo se zaregistruje nebo přihlásí, má na záložce Dnes během 3 sekund vidět: kdo je, jak na tom dnes je, co má udělat teď a kolik toho pro něj appka připravila. Působí to jako hotový prémiový produkt, ne jako seznam karet pod sebou. Vzor: Whoop a Oura (jedno silné shrnutí dne nahoře), Apple Fitness (animované kroužky), Yazio a MyFitnessPal (den jako časová osa jídel), Fitbod (karta dnešního tréninku), Future (osobní zpráva od trenéra).

## Opravit hned (chyby ze screenshotu produkce)

### 1. Oslovení bez jména
- Stav: pozdrav je jen „Dobrý večer." a hero ukazuje pole „Jak ti máme říkat?", i když jméno známe.
- Data (ověřeno v DB): `body_metrics.name` má všech 10 účtů. `profiles.name` je prázdné u všech 10 a `profiles.preferred_address` taky.
- Udělej `src/lib/vokativ.ts`: z křestního jména (první slovo z `body_metrics.name`) udělej 5. pád.
  - Pravidla: -a → -o (Honza → Honzo, Jana → Jano), -e/-ie beze změny (Lucie, Marie), -ek → -ku (Marek → Marku, Radek → Radku), -el → -le (Pavel → Pavle), -ec → -ci, -k/-h/-g/-ch → +u (Jindřich → Jindřichu), -š/-ž/-č/-ř/-c/-j → +i (Tomáš → Tomáši, Lukáš → Lukáši), souhláska + r → -ře (Petr → Petře), jiná souhláska → +e (Jan → Jane, Martin → Martine, David → Davide), -o/-i/-y/-u beze změny.
  - Plus malá tabulka výjimek (např. Pavel, Karel → Karle, Michal → Michale).
  - Když si pravidlem nejsi jistý, vrať `null`. Pozdrav pak zůstane bez jména, nikdy ne ve špatném tvaru.
  - Testy aspoň na 25 běžných českých jmen (mužských i ženských).
- Priorita oslovení: `profiles.preferred_address`, pak vokativ z `body_metrics.name`, pak bez jména.
- Pole „Jak ti máme říkat?" z hero úplně pryč. Oslovení jde změnit v Nastavení profilu (tam předvyplň vypočítaný tvar). Uložení jde přes existující `handleSavePreferredAddress`.
- Najdi, kde registrace zapisuje jméno, a zajisti, ať nové účty mají vyplněné i `profiles.name`. Cron `api/cron/inactivity-reminder.js` čte `profiles.name`, takže e-maily teď chodí bez jména. Pro stávající účty připrav migraci s backfillem `profiles.name` z `body_metrics.name`: jen soubor, nespouštět.

### 2. Karta „Jak ti dnešek seděl?" pryč
- Odeber `<DenniCheckin>` z `src/App.tsx` (záložka Dnes). Komponentu, API `api/daily-checkin.js` ani tabulku `daily_checkins` NEMAŽ. Čte je cron a `dailyAdherenceSync`.
- Uprav test `src/components/dnesniPrehled.test.ts`, který na pozici té karty spoléhá.

### 3. Hero má prázdnou plochu
- Tlačítko „Začít trénink A" sedí v samostatném velkém prázdném rámečku. Primární akci dej přímo do hero pod větu o stavu dne. Žádný rámeček navíc.

## Nová struktura záložky Dnes (shora dolů)

### A. Hero „Tvůj den" (`DnesHero`)
- Nahoře datum, den programu a trial chip (beze změny), pod tím pozdrav s oslovením, věta o stavu dne a jedno primární tlačítko (`dalsiKrok`).
- Tři ukazatele udělej jako skutečné kroužky postupu (styl Apple Fitness), animované při načtení:
  - Jídlo: snědené kcal / cíl. Kroužek se plní.
  - Trénink: 0 nebo 100 %. Po dokončení fajfka.
  - Váha: postup od startovní k cílové váze v % a pod tím „zbývá X kg".
- Klik na kroužek otevře příslušnou záložku.
- Na mobilu kroužky v jednom řádku pod pozdravem, kompaktně.

### B. Zpráva od TEDa (`RadekTeda`)
- Karta s avatarem TEDa a jednou zprávou z `coachTips` (styl Future). Tlačítko „Napsat TEDovi" otevře chat, pokud v appce existuje (najdi to). Když neexistuje, tlačítko nedávej.

### C. Časová osa dne (sloučí „Jídla dnes" a dnešní trénink)
- Jeden svislý seznam podle času: Snídaně → Svačina → Oběd → Trénink → Svačina → Večeře.
- Každá položka má čas, název, kcal nebo délku a zaškrtnutí. Klik otevře recept nebo trénink (existující handlery).
- Hotové položky jsou ztlumené s fajfkou. „Teď" je zvýrazněný bod na ose podle aktuálního času v Praze (logika `typJidlaVe4Pade` a `casVPraze` už existuje v `dalsiKrok.ts`, použij ji).
- Nahradí `DnesniPrehled`. Zachovej jeho funkce: nesoulad cíle a přegenerování plánu.

### D. „Tvoje cesta" (pokrok, tady je ten wow efekt)
- Mini graf váhy za posledních 30 dní (SVG sparkline) s čárou cíle.
- Série dní v řadě se splněným aspoň jedním jídlem nebo tréninkem, počítaná z existujících dat. Pokud data nestačí, sérii vynech.
- Tento týden: odcvičeno X z Y tréninků, zapsáno X z Y jídel.
- „Co pro tebe máme připravené": počty z reálných dat, např. „35 jídel na tento týden · 3 tréninky · nákupní seznam 42 položek · AI trenér TED". Tohle je karta, ze které má nový uživatel „wow".

### E. Nástroje (kompaktní dlaždice v mřížce 2×2 na mobilu, 4 v řadě na desktopu)
- Nákupní seznam, Tvůj další týden, Propojená zařízení, Účet a předplatné.
- Každá dlaždice má ikonu, název a jeden údaj (počet položek, stav synchronizace, tarif).
- Klik otevře stávající modal nebo sekci. Obsah `PropojenaZarizeniSection` a `UcetASpravaSection` zůstává, jen je schovaný za dlaždicí (rozbalení nebo modal, vyber, co je v kódu jednodušší).

### F. Prodej jen jednou
- `TrialCountdownStrip` a `TrialPaywallCard` dohromady nanejvýš jednou na stránce, dole nad nástroji. Nic prodejního nad časovou osou.

## První přihlášení (den 1)
- Když je `denProgramu` 1 nebo 2, zobraz nahoře pod hero jednorázovou uvítací kartu „Tvůj plán je připravený". Obsahuje 3–4 položky s reálnými počty (jídelníček na 7 dní, tréninky na týden, nákupní seznam, TED) a tlačítko „Ukaž mi první jídlo".
- Skrytí přes „Rozumím" se pamatuje v localStorage (čtení i zápis obal do try/catch). Po dni 2 se už neukáže.

## Kvalita
- Načítání: skeletony ve tvaru finálních karet, žádné poskakování layoutu.
- Animace krátké (do 400 ms), respektuj `prefers-reduced-motion`.
- Přístupnost: kroužky mají `aria-label` s čísly, položky osy jdou ovládat klávesnicí.
- Prázdné stavy (bez plánu, bez váhy, den bez tréninku) mají vlastní text a akci, nikdy prázdnou kartu.
- Nic ze stávajících funkcí nezmizí. Jen se přeskládá, kromě karty DenniCheckin a pole oslovení v hero.

## Výstup
- Na konci napiš krátký seznam změněných souborů, co je hotové, co ne a proč.
- U migrace (backfill `profiles.name`) napiš název souboru.
- Uveď 2–3 věci, které bys ještě doporučil.
