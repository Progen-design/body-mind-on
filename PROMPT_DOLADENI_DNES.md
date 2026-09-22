# PROMPT: Doladění Dnes a jedno oslovení všude (22. 9. 2026)

## Pravidla
- NEcommituj, NEpushuj, NEotvírej PR, NEspouštěj migrace. Žádné nové volání OpenAI.
- Na konci musí projít `npm run check`. Ke každé nové čisté funkci přidej test.
- Texty česky, pravdivě, bez zdravotních slibů.

## Co už je v main (neměnit logiku, jen navázat)
- `src/lib/cilovaVaha.ts`: automatická cílová váha. Ručně zadaný `goal_weight_kg` má přednost.
- `src/lib/vokativ.ts`: 5. pád z `body_metrics.name`. Jméno se čte dynamicky, NEkopíruje se do `profiles.name`.
- `podilTreninku` v `DnesHero.tsx`: kroužek tréninku se plní podle odškrtnutých cviků.

## 1. Cílová váha v Nastavení
- V `PreferencesModal.tsx` u pole „Cílová váha (kg)" dej jako placeholder automatickou hodnotu („automaticky 93 kg").
- Pod pole napiš nápovědu: „Nech prázdné a cíl spočítáme podle výšky, váhy a cíle. Vlastní číslo má přednost."
- Když uživatel pole vymaže a uloží, musí se `goal_weight_kg` opravdu smazat (null), ne ponechat. Ověř to v `api/profile-settings.js`: dnes `null` znamená „neměnit", takže je potřeba umět rozlišit „smazat".
- V hero u ukazatele Váha přidej k automatickému cíli malé „(auto)". Na to rozšiř `naPreference` o příznak `targetWeightAuto`.

## 2. Jedno skloňování jména všude
- `lib/inactivityReminder.js` má vlastní `osloveniJmenem`, která umí jen jména na -a („Jan" → nic). Přesuň logiku `src/lib/vokativ.ts` do sdíleného `lib/vokativ.js` (čisté JS + JSDoc, bez TS syntaxe), ať ji používá server i appka.
- `src/lib/vokativ.ts` ať jen re-exportuje ze sdíleného souboru. Testy `src/lib/vokativ.test.ts` musí projít beze změny očekávání.
- `textPripominky` pak použije sdílený vokativ. Uprav jeho testy: „Jan Příkopa" → „Ahoj Jane,", „Tomas" → „Ahoj Tomáši,", neznámé jméno → „Ahoj,".

## 3. Konzistence tréninku na celé Dnes
- Časová osa (`CasovaOsaDne`) i „Tvoje cesta" (`src/lib/tvojeCesta.ts`) musí trénink počítat stejně jako hero. Hotovo až po všech cvicích, jinak „2 z 4 cviků".
- Najdi každé další místo, kde se trénink bere jako splněný z `trenink_splnen` nebo `manual_workout_count`, a sjednoť ho na `podilTreninku` / `jeTreninkHotovy`. `podilTreninku` přesuň do `src/lib/trenink.ts` a z `DnesHero.tsx` ho jen importuj.

## 4. Mobil 390 px, kontrola kódu
- Projdi `DnesHero`, `CasovaOsaDne`, `TvojeCesta`, `NastrojeDlazdice` a `UvitaciKarta` na šířku 390 px. Hledej pevné šířky, `whitespace-nowrap` bez `truncate` a text, který na mobilu přeteče (např. „103,6 kg · cíl 94 kg" se v kroužku Váha láme do dvou řádků).
- Oprav, ať se nic neuřezává a kroužky zůstanou v jednom řádku.

## Výstup
- Krátký seznam změněných souborů, co je hotové a co ne.
