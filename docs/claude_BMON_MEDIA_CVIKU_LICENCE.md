# Licence médií katalogu cviků

Založeno 14. 9. 2026 (FÁZE 6, docs/DALSI_KROK.md 9.12) — soubor v repu dřív
neexistoval, přestože na něj FÁZE 4 a 6 odkazovaly. Nahrazuje neformální
poznámky v `docs/DALSI_KROK.md` 9.12 jako trvalý zápis o tom, odkud média
katalogu cviků pocházejí a s jakým rizikem.

## Aktuální zdroj (od 13. 9. 2026)

Animace cviků jsou vlastní, dvousnímkové WebP soubory poskládané z fotek
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense),
hostované v Supabase Storage — bucket `exercise-media`, cesta
`cviky/<canonical_key>.webp`, veřejné čtení / zápis jen `service_role`
(migrace `20260913212012_exercise_media_bucket.sql`).

Parametry: šířka 640 px, 700 ms/snímek, nekonečná smyčka, WebP quality 60
(po měření — 80 dávalo průměr 51,9 kB a max 118,5 kB, 60 dává průměr 34,7 kB
a max 79,1 kB, beze ztráty čitelnosti). Generuje `scripts/generuj_animace_cviku.py`,
nahrává `scripts/nahraj_animace_cviku.py`.

Registr (`exercise_asset_registry.gif_url`) ukazuje přímo na Storage URL.
Nové sloupce `media_source` (`free_exercise_db`), `media_license`
(`Unlicense`) a `media_updated_at` dokumentují původ a kdy byl `gif_url`
naposledy touhle pipeline změněn.

## Proč se to měnilo

Předchozí zdroj byl `static.exercisedb.dev`/`exercisedb.dev` (ExerciseDB) a
`wger.de`. Dvojí důvod:

1. **Licenční** — 28 animací v katalogu bylo © Gym Visual, používaných bez
   licence v placeném SaaS.
2. **UX** — cvik s animací je srozumitelnější než statický snímek nebo nic.

Migrace `20260913232254_vlastni_animace_cviku.sql` smazala odkazy na
`exercisedb.dev` a `wger.de` ze všech tří sloupců (`gif_url`, `image_url`,
`wger_exercise_image_url`) u všech 230 cviků v registru, bez výjimky —
i u těch, které novou animaci nedostaly. Ověřeno po nasazení: 0 zbylých
odkazů na starý CDN, 207/230 cviků má Storage animaci, `usable_in_plan` 227
(triggerem, médium se od migrace `20260909001500` nevyžaduje).

**Migrace v DB nestačila — v kódu zůstala díra do 14. 9. 2026.**
`lib/exerciseRegistryMedia.js` mělo natvrdo zapsané slovníky
(`TRUSTED_EXERCISE_GIF_BY_KEY`, `TRUSTED_EXTENDED_GIF_BY_KEY`), které
`mergeWithTrustedRegistryMedia()` aplikuje na každou cestu ke klientovi
i do zápisu (generování plánu, výměna cviku, `POST /api/plan/exercise-variant`).
I po smazání z DB tahle funkce 11 klíčům (`overhead_press`,
`tricep_extension`, `plank_side`, `warmup`, `cooldown`, `rest`, `burpee`,
`glute_bridge`, `hammer_curl`, `cable_row`, `hip_thrust`) potichu vracela
`gif_url` zpátky na Gym Visual — v DB bylo 0 odkazů, uživatel jich ale pořád
viděl 11. Opraveno 14. 9. 2026: oba slovníky vyprázdněny natrvalo, funkce
`exercisedbGifUrl()` smazána, `isTrustedExercisedbGifUrl()` přejmenována na
`isTrustedExerciseMediaUrl()` a uznává jen vlastní Storage URL. **Aktuální
stav je: 207 cviků s vlastní animací, 23 bez média, žádný odkaz na Gym
Visual ani wger.de nikde v kódu ani v datech.**

## Pokrytí — 207 ze 230

- **193** — jistá shoda přes `exercise_asset_registry.external_id` nebo
  přesný název (skupina A, `scripts/data/mapovani_animace_skupina_a.json`).
- **14** — ruční výběr ze skupiny B (20 kandidátů, vybíral Honza vizuálně
  v `scripts/vyber_animaci_skupina_b.html`), `scripts/data/mapovani_animace_skupina_b.json`.

### 23 cviků zůstává bez vlastní animace

- **6 ze skupiny B** — kandidát v datasetu neodpovídal českému postupu:
  `machine_bicep_curl` (vadný zdrojový snímek — ukazuje tlak nad hlavu, ne
  bicepsový zdvih), `tricep_extension` (kandidáti jsou extenze vleže, postup
  popisuje kladku vestoje), `plank_side` (kandidát je klik s rotací),
  `overhead_press` (kandidát je Smith machine vsedě),
  `dumbbell_romanian_deadlift` (kandidát má velkou činku),
  `glute_bridge` (kandidát má činku, postup je bez zátěže).
- **14 dalších kandidátů mimo scope generátoru** — odloženo vědomě, nikdo je
  teď nevidí. Úplný seznam je ve FÁZI 0 analýze (schváleno 9. 9. 2026,
  `docs/DALSI_KROK.md` 9.12).
- **3 bez jakéhokoli kandidáta** ve free-exercise-db: `bulgarian_squat`,
  `burpee`, `jumping_jack`. Zůstávají s českým postupem, bez obrázku i videa.

Tyhle cviky nejsou rozbité — mají český postup a jsou `usable_in_plan`
(trigger `enforce_exercise_registry_rules` médium nevyžaduje), jen bez
vizuálu.

## Vědomě přijaté riziko (zapsáno 14. 9. 2026)

**Unlicense free-exercise-db kryje kód a strukturu repozitáře. Řetězec práv
k samotným fotkám je mlhavější, než README naznačuje** — projekt fotky
sbíral z různých zdrojů a Unlicense je vlastní prohlášení autora repozitáře,
ne doložený souhlas každého fotografa/modelu. Riziko je nižší než u
předchozího stavu (28 animací prokazatelně © Gym Visual bez licence), ale
není nulové. Přijato vědomě výměnou za bezplatný zdroj bez atribuční
povinnosti a bez blokujícího rizika u konkrétního fotografa. Pokud se objeví
konkrétní nárok k jedné fotce, řešit smazáním dané animace (`gif_url = NULL`
pro daný `canonical_key`), ne plošnou revizí zdroje.

## Vizuální kontrola — hotová, bez nálezu

Všech **207** živých animací prošlo okem: 20 kandidátů skupiny B při výběru
(`scripts/vyber_animaci_skupina_b.html`) a 193 animací skupiny A dne
14. 9. 2026 v `scripts/kontrola_animaci_skupina_a.html`. Ani jedna nebyla
označená jako nesedící, žádná se proto nemaže.

Kontrola okem byla nutná, protože formální shoda klíče nestačí:
`machine_bicep_curl` měl vadný snímek přímo ve zdrojových datech — shoda přes
`external_id` seděla, obrázek ukazoval jiný cvik. Takovou chybu SQL nenajde
a animace jsou živé v produkci (migrace `20260913232254`), takže by ji viděl
přímo uživatel. Viz `docs/DALSI_KROK.md` 9.12.

## Otevřené body

- **FÁZE 5 (varianty `easier_key`/`harder_key`)** — přepárování na rozšířený
  katalog, ručně a se schválením dvojic. Neřešeno.

## Kde hledat dál

- Trust vrstva (co se považuje za ověřené médium): `lib/exerciseRegistryMedia.js`.
- Generátor a upload: `scripts/generuj_animace_cviku.py`,
  `scripts/nahraj_animace_cviku.py`.
- Mapování canonical_key → zdrojová fotka: `scripts/data/mapovani_animace_skupina_a.json`,
  `scripts/data/mapovani_animace_skupina_b.json`.
- Bucket: `supabase/migrations/20260913212012_exercise_media_bucket.sql`.
- Registr: `supabase/migrations/20260913232254_vlastni_animace_cviku.sql`.
- Historie rozhodnutí a čísel: `docs/DALSI_KROK.md`, sekce 9.12.
