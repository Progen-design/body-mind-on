-- NÁVRH — NEAPLIKOVÁNO. Úkol: "každý cvik má obtížnost a konkrétní český
-- postup, uživatel si může vybrat lehčí nebo těžší variantu".
--
-- ===========================================================================
-- NAMĚŘENO (mimo tuto migraci, dodáno v zadání — neověřováno dotazem)
-- ===========================================================================
-- exercise_asset_registry: 230 řádků, 205 usable_in_plan. 47 z nich má
-- level = NULL a prázdné instructions_en/instructions_cs. Generátor plánu
-- (lib/services/planOrchestratorResolve.js resolveWorkouts()) používá 29
-- různých canonical_key a jen 4 z nich měly obtížnost i postup.
--
-- ===========================================================================
-- CO TATO MIGRACE DĚLÁ
-- ===========================================================================
-- 1) Přidá sloupce easier_key / harder_key (canonical_key lehčí/těžší
--    varianty ze stejné svalové partie — nikdy generováno, jen ruční pár
--    nebo NULL).
-- 2) UPDATE pro přesně těch 47 klíčů, které generátor používá a dnes nemají
--    obtížnost ani postup — ručně psaná česká data,
--    lib/seeds/obtiznostAPostupCviku.js je zdroj pravdy pro obsah (tahle
--    migrace je z něj ručně přepsaná do SQL, ne naopak).
-- 3) Jedním UPDATEm s korelovaným poddotazem doplní easier_key/harder_key
--    i zbylým ~183 cvikům v registru, kde to jde odvodit ze stejného
--    primary_muscle a NEJBLIŽŠÍ nižší/vyšší úrovně obtížnosti (level).
--    Neřeší se ručně řádek po řádku a nepřepisuje se těch 47 výše — i jejich
--    záměrné NULL (např. pushup.easier_key — "cvik na kolenou" jako
--    samostatný canonical_key nemáme) musí zůstat NULL, ne se dopočítat
--    odjinud.
--
-- Trigger enforce_exercise_registry_rules (migrace 20260803210000) počítá
-- usable_in_plan jen z gif_url/image_url, display_name_cs, equipment_class,
-- primary_muscle a tvaru canonical_key — level/mechanic/instructions_cs/
-- easier_key/harder_key na něj nemají vliv. UPDATE níž proto nemůže nikomu
-- nechtěně vzít ani dát usable_in_plan.

-- ---------------------------------------------------------------------------
-- 1) Nové sloupce
-- ---------------------------------------------------------------------------
ALTER TABLE public.exercise_asset_registry
  ADD COLUMN IF NOT EXISTS easier_key text,
  ADD COLUMN IF NOT EXISTS harder_key text;

COMMENT ON COLUMN public.exercise_asset_registry.easier_key IS
  'canonical_key lehčí varianty ze stejné svalové partie/pohybového vzoru. NULL, když srovnatelná varianta v katalogu není — nikdy se nedomýšlí.';
COMMENT ON COLUMN public.exercise_asset_registry.harder_key IS
  'canonical_key těžší varianty ze stejné svalové partie/pohybového vzoru. NULL, když srovnatelná varianta v katalogu není — nikdy se nedomýšlí.';

-- ---------------------------------------------------------------------------
-- 2) 47 klíčů, které generátor plánu používá — ručně psaná data
--    (lib/seeds/obtiznostAPostupCviku.js je zdroj pravdy pro obsah)
-- ---------------------------------------------------------------------------
UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Lehni si na lavici, chodidla pevně na zemi, záda i hlavu opřená o podložku.', 'Úchop veď o něco šíř než ramena, činku sundej ze stojanu nad hrudník.', 'Nadechni se, spusť činku k hrudníku za 2 sekundy, lokty drž asi 45° od těla.', 'Jakmile se činka lehce dotkne hrudníku, zastav se.', 'Vydechni a zatlač činku zpátky nahoru do napnutých paží.', 'Lopatky drž po celou dobu stažené k sobě a zadek na lavici.']::text[],
  easier_key = 'chest_press',
  harder_key = 'dumbbell_press'
WHERE canonical_key = 'bench_press';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se, chodidla na šířku boků, činka v obou rukou před stehny.', 'Předkloň se v bocích asi na 45°, záda drž rovná, kolena mírně pokrčená.', 'Nadechni se a přitáhni činku k pupku, lokty veď těsně kolem těla.', 'V horní poloze na chvíli stáhni lopatky k sobě.', 'Vydechni a spouštěj činku zpět dolů pod kontrolou.', 'Hlavu drž v prodloužení páteře, nezaklánej ji nahoru.']::text[],
  easier_key = 'dumbbell_row',
  harder_key = NULL
WHERE canonical_key = 'bent_over_row';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Postav se, chodidla na šířku boků, v každé ruce jedna činka podél těla.', 'Lokty drž pevně u boků po celou dobu cviku.', 'Nadechni se a zdvihni činky pokrčením loktů k ramenům.', 'V horní poloze na chvíli stiskni biceps.', 'Vydechni a spouštěj činky zpět dolů do napnutých paží.', 'Zápěstí drž rovně, netrhej činkou pomocí zad.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'bicep_curl';

UPDATE public.exercise_asset_registry SET
  level = 'expert',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se, chodidla na šířku boků.', 'Podřepni a polož dlaně na zem před chodidly.', 'Odkopni nohy vzad do vzporu ležmo, tělo drž v jedné přímce.', 'Přiskoč nohama zpět k rukám do podřepu.', 'Vymrsti se z podřepu nahoru do výskoku, paže zvedni nad hlavu.', 'Doskoč měkce do mírného podřepu a hned navaž dalším opakováním.']::text[],
  easier_key = 'mountain_climber',
  harder_key = NULL
WHERE canonical_key = 'burpee';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Sedni si ke kladce, chodidla opři o stupačky, kolena mírně pokrčená.', 'Uchop madlo, záda drž vzpřímená, mírně nakloněná vpřed.', 'Nadechni se a přitáhni madlo k břichu, lokty veď těsně kolem těla.', 'V koncové poloze stáhni lopatky k sobě a na chvíli se zastav.', 'Vydechni a nech paže pomalu se vracet zpět, dokud se lopatky nerozevřou.', 'Trup drž po celou dobu vzpřímený, nehoupej se dozadu.']::text[],
  easier_key = NULL,
  harder_key = 'bent_over_row'
WHERE canonical_key = 'cable_row';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Postav se na špičky na okraj schodu nebo podložky, paty ve vzduchu.', 'Drž se opory pro rovnováhu, chodidla na šířku boků.', 'Nadechni se a zvedni se co nejvýš na špičky.', 'Nahoře se na chvíli zastav a stiskni lýtka.', 'Vydechni a spouštěj paty pomalu pod úroveň schodu, dokud neucítíš protažení.', 'Kolena drž po celou dobu mírně napnutá, nekrč je.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'calf_raise';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Nastav sedačku tak, aby madla byla v úrovni hrudníku.', 'Sedni si, záda opři o opěrku, chodidla pevně na zemi.', 'Nadechni se, uchop madla a lokty drž mírně pod úrovní ramen.', 'Vydechni a zatlač madla vpřed do téměř napnutých paží, lokty nezamykej.', 'Nadechni se a pomalu, po 2 sekundách, se vrať do výchozí polohy.', 'Lopatky drž stažené k opěrce, ramena netahej nahoru k uším.']::text[],
  easier_key = NULL,
  harder_key = 'bench_press'
WHERE canonical_key = 'chest_press';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Lehni si na záda, paže zvedni kolmo nad ramena, kolena pokrčená v pravém úhlu nad boky.', 'Dolní záda zatlač k zemi a v této poloze je drž po celou dobu.', 'Nadechni se a pomalu spouštěj jednu paži za hlavu a opačnou nohu nataženou k zemi.', 'Zastav se těsně nad zemí, dolní záda se nesmí odlepit.', 'Vydechni a vrať paži i nohu zpět do výchozí polohy.', 'Stranu vystřídej a pokračuj plynule, pohyb dělej pomalu.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'dead_bug';

UPDATE public.exercise_asset_registry SET
  level = 'expert',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se k čince, chodidla na šířku boků, holeně u tyče.', 'Ohni se v bocích a kolenou, uchop tyč o něco šíř než nohy, paže napnuté.', 'Nadechni se, napni záda do rovné polohy, hrudník mírně vytoč vpřed.', 'Zatlač přes paty a zvedej tyč podél holení do vzpřímeného stoje.', 'Boky a ramena zvedej zároveň, záda nesmí kulatit.', 'Vydechni nahoře, pak spouštěj tyč zpět stejnou cestou dolů.']::text[],
  easier_key = 'romanian_deadlift',
  harder_key = NULL
WHERE canonical_key = 'deadlift';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se, chodidla na šířku boků, v každé ruce jedna činka před stehny.', 'Kolena nech mírně pokrčená po celou dobu cviku.', 'Nadechni se a posouvej boky vzad, trup se sklápí vpřed, činky kloužou podél nohou.', 'Spouštěj se, dokud neucítíš tah v zadní straně stehen, záda drž rovná.', 'Vydechni a zatlač boky vpřed zpět do vzpřímeného stoje.', 'Ramena drž stažená, činky těsně u nohou.']::text[],
  easier_key = NULL,
  harder_key = 'romanian_deadlift'
WHERE canonical_key = 'dumbbell_romanian_deadlift';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Polož jedno koleno a stejnou ruku na lavici, druhá noha pevně na zemi.', 'Záda drž rovná a rovnoběžná se zemí, v druhé ruce drž činku volně dolů.', 'Nadechni se a přitáhni činku k boku, loket veď těsně podél těla.', 'V horní poloze stáhni lopatku k páteři.', 'Vydechni a spouštěj činku zpět dolů do napnuté paže.', 'Trup drž nehybný, netoč se za paží.']::text[],
  easier_key = NULL,
  harder_key = 'bent_over_row'
WHERE canonical_key = 'dumbbell_row';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se mezi dvě činky nebo kettlebelly, chodidla na šířku boků.', 'Podřepni, uchop zátěž v obou rukou, záda drž rovná.', 'Zatlač přes paty a napřimuj se do vzpřímeného stoje se zátěží podél těla.', 'Ramena drž stažená dozadu a dolů, hruď mírně vypnutá.', 'Vykroč a jdi vpřed pevným, kontrolovaným krokem, paže nech viset volně.', 'Zátěž drž pevně po celou vzdálenost, netoč se do stran.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'farmer_carry';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Lehni si na záda, kolena pokrčená, chodidla na šířku boků blízko hýždí.', 'Paže polož volně podél těla, dlaněmi dolů.', 'Nadechni se, napni břicho a zatlač přes paty boky vzhůru.', 'Nahoře stiskni hýždě, tělo od kolen po ramena tvoří rovnou linii.', 'Vydechni nahoře, pak spouštěj boky zpět dolů pod kontrolou.', 'Dolní záda drž po celou dobu neutrální, nepropínej se do prohnutí.']::text[],
  easier_key = NULL,
  harder_key = 'hip_thrust'
WHERE canonical_key = 'glute_bridge';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se, chodidla o něco šíř než ramena, jednu činku drž oběma rukama u hrudníku.', 'Nadechni se, napni břicho a spouštěj se ohnutím kolen a boků.', 'Lokty veď mezi koleny dolů, dokud nejsou boky pod úrovní kolen.', 'Záda drž rovná, hruď mířící vpřed, kolena ve směru špiček.', 'Vydechni a zatlač se přes paty zpět nahoru do stoje.', 'Činku drž těsně u těla po celou dobu pohybu.']::text[],
  easier_key = 'squat',
  harder_key = 'bulgarian_squat'
WHERE canonical_key = 'goblet_squat';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Postav se, chodidla na šířku boků, v každé ruce jedna činka podél těla, dlaně proti sobě.', 'Lokty drž pevně u boků po celou dobu cviku.', 'Nadechni se a zdvihni činky pokrčením loktů, dlaně zůstávají proti sobě.', 'V horní poloze se na chvíli zastav.', 'Vydechni a spouštěj činky zpět dolů do napnutých paží.', 'Zápěstí drž pevně, neklop je do stran.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'hammer_curl';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Lehni si na břicho do stroje, polštáře opři o kotníky, kolena těsně za okrajem podložky.', 'Uchop madla po stranách, boky drž přitisknuté k podložce.', 'Nadechni se a pokrč kolena, přitáhni patu k hýždím.', 'Nahoře se na chvíli zastav a stiskni zadní stranu stehen.', 'Vydechni a spouštěj zátěž zpět dolů pod kontrolou.', 'Boky drž po celou dobu na podložce, nezvedej je.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'hamstring_curl';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Sedni si ke kladce, stehna zaklesni pod polstrování.', 'Uchop tyč nadhmatem o něco šíř než ramena.', 'Nadechni se a stáhni tyč k horní části hrudníku, lokty táhni dolů a mírně vzad.', 'V dolní poloze stáhni lopatky k sobě, hrudník mírně vypni.', 'Vydechni a nech tyč pomalu stoupat zpět do napnutých paží.', 'Trup drž vzpřímený, nezaklánej se dozadu.']::text[],
  easier_key = NULL,
  harder_key = 'pull_up'
WHERE canonical_key = 'lat_pulldown';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Sedni si do stroje, záda i hlavu opři o opěrku, chodidla polož na plošinu na šířku ramen.', 'Uvolni pojistky a nadechni se.', 'Spouštěj plošinu pokrčením kolen, dokud nejsou kolena přibližně v pravém úhlu.', 'Kolena drž ve směru špiček, záda i hlavu nezvedej z opěrky.', 'Vydechni a zatlač plošinu zpět do skoro napnutých kolen, nezamykej je.', 'Chodidla drž po celou dobu celou plochou na plošině.']::text[],
  easier_key = NULL,
  harder_key = 'squat'
WHERE canonical_key = 'leg_press';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se vzpřímeně, chodidla na šířku boků, ruce volně podél těla nebo v bok.', 'Nadechni se a udělej jednou nohou dlouhý krok vpřed.', 'Spouštěj se, dokud zadní koleno skoro nedosáhne země, přední koleno nad kotníkem.', 'Trup drž vzpřímený, váhu drž na přední patě.', 'Vydechni a odraz se přes přední patu zpět do stoje.', 'Kroky střídej na obě nohy stejnoměrně.']::text[],
  easier_key = 'leg_press',
  harder_key = 'step_up'
WHERE canonical_key = 'lunges';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Zaujmi vzpor ležmo, dlaně pod rameny, tělo v jedné přímce.', 'Napni břicho, ať se boky neprohýbají ani nezvedají.', 'Nadechni se a přitáhni jedno koleno k hrudníku, druhou nohu nech nataženou.', 'Vydechni a vrať nohu zpět, ve stejném rytmu vystřídej druhou nohou.', 'Boky drž po celou dobu v jedné výšce, netrč zadkem nahoru.', 'Tempo zrychluj jen tak, aby si udržel kontrolu nad polohou boků.']::text[],
  easier_key = 'plank',
  harder_key = 'burpee'
WHERE canonical_key = 'mountain_climber';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se, chodidla na šířku boků, činku drž v úrovni ramen, dlaně vpřed.', 'Napni břicho a hýždě, ať se dolní záda neprohýbá.', 'Nadechni se a zatlač činku svisle nad hlavu do napnutých paží.', 'Hlavu mírně provlékni pod činkou, jakmile prochází kolem obličeje.', 'Vydechni nahoře, pak spouštěj činku zpět dolů k ramenům pod kontrolou.', 'Zápěstí drž rovně nad lokty po celou dobu pohybu.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'overhead_press';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Lehni si na břicho a opři se o předloktí a špičky chodidel.', 'Lokty polož přímo pod ramena, tělo natáhni do rovné linie od hlavy k patám.', 'Napni břicho a hýždě, boky nesmí klesat ani stoupat nahoru.', 'Dýchej klidně a plynule po celou dobu výdrže.', 'Hlavu drž v prodloužení páteře, nedívej se nahoru ani si ji nepokládej.', 'Pokud boky začnou klesat, cvik ukonči.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'plank';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Lehni si na bok, opři se o jedno předloktí přímo pod ramenem.', 'Nohy natáhni jednu na druhou, tělo tvoří rovnou linii od hlavy k patám.', 'Napni bok a boky zvedni ze země, druhou ruku dej na bok nebo nataž nahoru.', 'Boky drž zvednuté, netoč trupem dopředu ani dozadu.', 'Dýchej klidně a plynule po celou dobu výdrže.', 'Po odcvičeném čase vyměň stranu.']::text[],
  easier_key = 'plank',
  harder_key = NULL
WHERE canonical_key = 'plank_side';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Zaujmi vzpor ležmo, dlaně o něco šíř než ramena, tělo v jedné přímce od hlavy k patám.', 'Napni břicho a hýždě, ať se boky neprohýbají ani nezvedají.', 'Nadechni se a spouštěj tělo dolů, lokty svírej asi 45° od těla.', 'Zastav se, jakmile je hrudník pár centimetrů nad zemí.', 'Vydechni a zatlač se zpět nahoru do napnutých paží.', 'Bradu drž mírně přitaženou, hlavu neklop dolů ani nezaklánej.']::text[],
  easier_key = NULL,
  harder_key = 'dips'
WHERE canonical_key = 'pushup';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se, chodidla na šířku boků, činku drž oběma rukama před stehny.', 'Kolena nech mírně pokrčená a v této pozici je drž po celou dobu.', 'Nadechni se a posouvej boky vzad, trup se sklápí vpřed, činka klouže podél nohou.', 'Spouštěj se, dokud neucítíš tah v zadní straně stehen, záda drž rovná.', 'Vydechni a zatlač boky vpřed zpět do vzpřímeného stoje.', 'Činku drž těsně u těla po celou dobu pohybu.']::text[],
  easier_key = 'dumbbell_romanian_deadlift',
  harder_key = 'deadlift'
WHERE canonical_key = 'romanian_deadlift';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Sedni si na zem, kolena pokrčená, chodidla mírně nad zemí nebo opřená o podlahu.', 'Zakloň trup dozadu asi o 45°, záda drž rovná, břicho napnuté.', 'Ruce spoj před hrudníkem nebo drž zátěž oběma rukama.', 'Nadechni se a otoč trup k jedné straně, dotkni se rukama u boku.', 'Vydechni a otoč se plynule na druhou stranu.', 'Otáčej trupem, nekruť jen paže, boky drž nehybně.']::text[],
  easier_key = 'crunch',
  harder_key = NULL
WHERE canonical_key = 'russian_twist';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se, chodidla na šířku ramen, špičky mírně vytočené ven.', 'Nadechni se, napni břicho a začni ohýbat kolena a boky zároveň.', 'Spouštěj se, dokud nejsou stehna aspoň rovnoběžná se zemí.', 'Kolena drž ve směru špiček, záda rovná, hruď mířící vpřed.', 'Vydechni a zatlač se zpět nahoru přes paty do vzpřímeného stoje.', 'Váhu drž po celé chodidle, paty se nesmí zvedat.']::text[],
  easier_key = NULL,
  harder_key = 'goblet_squat'
WHERE canonical_key = 'squat';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Lehni si na břicho, paže nataž vpřed, nohy nataž za sebe.', 'Napni hýždě a břicho, hlavu drž v prodloužení páteře.', 'Nadechni se a zároveň zvedni paže, hrudník i nohy pár centimetrů nad zem.', 'Nahoře se na chvíli zastav, dívej se dolů na podložku.', 'Vydechni a pomalu spouštěj vše zpět dolů pod kontrolou.', 'Pohyb dělej plynule, netrhej sebou.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'superman';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Postav se čelem ke kladce, uchop lano nebo tyč nadhmatem.', 'Lokty přitiskni k tělu a drž je nehybně po celou dobu cviku.', 'Nadechni se a zatlač kladku dolů do napnutých paží.', 'V dolní poloze na chvíli stiskni triceps.', 'Vydechni a nech kladku pomalu stoupat zpět, lokty pořád u těla.', 'Trup drž vzpřímený, nezaklánej se dozadu.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'tricep_extension';

UPDATE public.exercise_asset_registry SET
  level = 'expert',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se čelem k bedně, chodidla na šířku boků, paže volně podél těla.', 'Podřepni a zhoupni paže vzad, ať nabereš rozjezd.', 'Vymrsti se přes paty a švihem paží vpřed a nahoru, doskoč na bednu oběma nohama najednou.', 'Doskakuj měkce do podřepu, kolena ve směru špiček.', 'Narovnej se nahoře na bedně do vzpřímeného stoje.', 'Z bedny sestup dolů, nikdy neseskakuj zpátky dolů.']::text[],
  easier_key = 'step_up',
  harder_key = NULL
WHERE canonical_key = 'box_jump';

UPDATE public.exercise_asset_registry SET
  level = 'expert',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se zády ke stoličce, jednu nohu polož nártem na její sedák.', 'Stojnou nohu posuň dostatečně dopředu, ať koleno nepřečnívá přes špičku.', 'Nadechni se a spouštěj se pokrčením přední nohy, dokud koleno zadní nohy skoro nedosáhne země.', 'Trup drž vzpřímený, váhu drž na patě přední nohy.', 'Vydechni a zatlač se přes patu zpět nahoru do stoje.', 'Pohyb dělej pomalu, nekymácej se do stran.']::text[],
  easier_key = 'goblet_squat',
  harder_key = NULL
WHERE canonical_key = 'bulgarian_squat';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Lehni si na lavici, v každé ruce jednu činku nad hrudníkem, dlaně proti sobě.', 'Lokty mírně pokrč a v této pozici je drž po celou dobu cviku.', 'Nadechni se a spouštěj paže do stran, dokud neucítíš tah v hrudníku.', 'Zastav se, jakmile jsou paže v rovině s rameny, níž nechoď.', 'Vydechni a přitáhni činky obloukem zpět nad hrudník.', 'Pohyb veď hrudníkem, ne zápěstím ani rameny.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'chest_fly';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Lehni si na záda, kolena pokrčená, chodidla na zemi na šířku boků.', 'Ruce polož zkříženě na hrudník nebo lehce za hlavu, lokty do stran.', 'Nadechni se, napni břicho a zvedni lopatky ze země.', 'Bradu drž mírně od hrudníku, netahej hlavu rukama.', 'Vydechni nahoře, pak se pomalu vrať zpět dolů pod kontrolou.', 'Dolní záda drž po celou dobu přitisknutá k zemi.']::text[],
  easier_key = NULL,
  harder_key = 'leg_raise'
WHERE canonical_key = 'crunch';

UPDATE public.exercise_asset_registry SET
  level = 'expert',
  mechanic = 'compound',
  instructions_cs = ARRAY['Uchop bradla, ruce narovnané, tělo drž mírně předkloněné vpřed.', 'Nadechni se a pomalu spouštěj tělo dolů pokrčením loktů.', 'Klesej, dokud nejsou ramena přibližně v úrovni loktů, níž nechoď.', 'Lokty veď mírně od těla, ramena netahej nahoru k uším.', 'Vydechni a zatlač se zpět nahoru do skoro napnutých paží.', 'Nohy drž pokrčené a zkřížené, ať se nekymácíš.']::text[],
  easier_key = 'tricep_dip',
  harder_key = NULL
WHERE canonical_key = 'dips';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Lehni si na lavici, v každé ruce jednu činku, chodidla na zemi.', 'Nadechni se, zvedni činky nad hrudník, dlaně směřují vpřed.', 'Spouštěj činky k hrudníku za 2 sekundy, lokty 45° od těla.', 'U hrudníku se zastav, zápěstí drž rovně nad lokty.', 'Vydechni a zatlač činky zpět nahoru, u vrcholu se nedotýkej.', 'Lopatky drž stažené k lavici po celou dobu série.']::text[],
  easier_key = 'chest_press',
  harder_key = NULL
WHERE canonical_key = 'dumbbell_press';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Nastav kladku do výšky očí, uchop lano oběma rukama.', 'Postav se, chodidla na šířku boků, mírně se zapři vzad.', 'Nadechni se a táhni lano k obličeji, lokty veď vysoko do stran.', 'V koncové poloze stáhni lopatky k sobě, palce miř dozadu.', 'Vydechni a nech lano pomalu se vracet zpět do napnutých paží.', 'Ramena drž dole, netahej je nahoru k uším.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'face_pull';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Sedni si na zem, horní záda opři o lavici, činku polož na boky.', 'Chodidla polož na šířku boků, blízko k hýždím.', 'Nadechni se, napni břicho a zatlač přes paty boky vzhůru.', 'Nahoře stiskni hýždě, tělo od kolen po ramena tvoří rovnou linii.', 'Vydechni nahoře, pak spouštěj boky zpět dolů pod kontrolou.', 'Bradu drž mírně přitaženou, nezaklánej hlavu vzad.']::text[],
  easier_key = 'glute_bridge',
  harder_key = NULL
WHERE canonical_key = 'hip_thrust';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Nastav lavici na sklon 30–45°, lehni si, chodidla pevně na zemi.', 'Úchop veď o něco šíř než ramena, činku sundej nad horní hrudník.', 'Nadechni se, spusť činku k hornímu hrudníku, lokty 45° od těla.', 'U hrudníku se na chvíli zastav, neodrážej se.', 'Vydechni a zatlač činku zpět nahoru do napnutých paží.', 'Lopatky drž stažené, hlavu opřenou o lavici po celou dobu.']::text[],
  easier_key = 'chest_press',
  harder_key = NULL
WHERE canonical_key = 'incline_bench_press';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se vzpřímeně, chodidla u sebe, paže podél těla.', 'Odraz se a zároveň roznož chodidla širší než ramena.', 'Ve stejnou chvíli zvedni paže obloukem nad hlavu.', 'Doskoč měkce na obě chodidla najednou.', 'Hned se odraz zpátky, chodidla i paže vrať do výchozí polohy.', 'Udržuj plynulý rytmus a klidné dýchání po celou dobu.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'jumping_jack';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Postav se, chodidla na šířku boků, v každé ruce jedna činka podél těla.', 'Lokty nech mírně pokrčené po celou dobu cviku.', 'Nadechni se a zvedej paže do stran, dokud nejsou v úrovni ramen.', 'Nahoře se na chvíli zastav, zápěstí drž mírně níž než lokty.', 'Vydechni a spouštěj paže pomalu zpět dolů podél těla.', 'Trupem se nehoupej, pohyb veď jen rameny.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'lateral_raise';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'isolation',
  instructions_cs = ARRAY['Lehni si na záda, nohy natažené, dlaně polož pod hýždě nebo podél těla.', 'Nadechni se, napni břicho a zatlač dolní záda k zemi.', 'Zvedej natažené nohy nahoru, dokud nejsou kolmo k zemi.', 'Vydechni nahoře, pak spouštěj nohy pomalu zpět dolů pod kontrolou.', 'Jakmile se dolní záda začnou odlepovat od země, pohyb zastav a nohy níž nepouštěj.', 'Dýchej plynule, nezadržuj dech.']::text[],
  easier_key = 'crunch',
  harder_key = NULL
WHERE canonical_key = 'leg_raise';

UPDATE public.exercise_asset_registry SET
  level = 'expert',
  mechanic = 'compound',
  instructions_cs = ARRAY['Uchop hrazdu nadhmatem o něco šíř než ramena, tělo nech volně viset.', 'Napni břicho a hýždě, nohy zkřiž nebo drž rovně.', 'Nadechni se a přitáhni se nahoru, dokud se brada nedostane nad hrazdu.', 'Lokty táhni dolů a mírně vzad, ramena drž dole od uší.', 'Vydechni a spouštěj se zpět dolů do napnutých paží pod kontrolou.', 'Trup drž nehybný, nekopej nohama ani se nehoupej.']::text[],
  easier_key = 'lat_pulldown',
  harder_key = NULL
WHERE canonical_key = 'pull_up';

UPDATE public.exercise_asset_registry SET
  level = 'intermediate',
  mechanic = 'compound',
  instructions_cs = ARRAY['Postav se čelem k bedně nebo stabilní stoličce, chodidla na šířku boků.', 'Nadechni se, jednu nohu polož celým chodidlem na bednu.', 'Zatlač přes patu na bedně a vytáhni tělo nahoru, druhou nohu jen dokroč.', 'Trup drž vzpřímený, nezaklánej se dozadu ani si nepomáhej odrazem druhé nohy.', 'Vydechni nahoře, pak se pod kontrolou vrať zpět dolů stejnou nohou.', 'Nohu vyměň po odcvičeném počtu opakování.']::text[],
  easier_key = 'lunges',
  harder_key = 'box_jump'
WHERE canonical_key = 'step_up';

UPDATE public.exercise_asset_registry SET
  level = 'beginner',
  mechanic = 'compound',
  instructions_cs = ARRAY['Sedni si na kraj lavice, dlaně vedle boků, prsty směrem k tělu.', 'Nohy natáhni před sebe, paty na zemi, boky posuň před hranu lavice.', 'Nadechni se a spouštěj boky dolů pokrčením loktů k 90°.', 'Lokty drž vzadu za tělem, ne do stran.', 'Vydechni a zatlač se zpět nahoru do napnutých paží.', 'Ramena drž dole, od uší, po celou dobu pohybu.']::text[],
  easier_key = NULL,
  harder_key = 'dips'
WHERE canonical_key = 'tricep_dip';

UPDATE public.exercise_asset_registry SET
  level = NULL,
  mechanic = NULL,
  instructions_cs = ARRAY['Začni volnou chůzí nebo klusem na místě po dobu 2–3 minut, dýchej klidně nosem.', 'Zařaď kroužení pažemi vpřed i vzad, každým směrem 10krát.', 'Přidej dynamické výpady vpřed se současným kroužením trupu do stran.', 'Zařaď dřepy s vlastní vahou pomalým tempem, 10–15 opakování.', 'Postupně zvyšuj tempo pohybů, ale dýchání drž pravidelné a plynulé.', 'Rozcvičku ukonči, až ucítíš zahřátí svalů a mírně zrychlený tep.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'warmup';

UPDATE public.exercise_asset_registry SET
  level = NULL,
  mechanic = NULL,
  instructions_cs = ARRAY['Vyber klidné tempo chůze, při kterém se dá bez potíží mluvit.', 'Drž vzpřímené držení těla, ramena uvolněná, paže se volně houpou podél těla.', 'Dýchej pravidelně nosem, výdech nech plynulý ústy nebo nosem.', 'Udržuj stejné tempo po celou naplánovanou dobu chůze.', 'Pokud ucítíš únavu, zpomal tempo, ale procházku nepřerušuj úplně.', 'Zakonči procházku postupným zpomalením posledních 2–3 minut.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'rest';

UPDATE public.exercise_asset_registry SET
  level = NULL,
  mechanic = NULL,
  instructions_cs = ARRAY['Zpomal tempo pohybu a přejdi na klidnou chůzi po dobu 1–2 minut.', 'Protáhni zadní stranu stehen předklonem s mírně pokrčenými koleny, vydrž 20–30 sekund.', 'Protáhni lýtka opřením o zeď s nataženou zadní nohou, vydrž 20–30 sekund na každou stranu.', 'Protáhni hrudník a ramena zapažením a mírným otevřením hrudníku, vydrž 20–30 sekund.', 'Dýchej pomalu a zhluboka, nádech nosem, výdech ústy.', 'Strečink ukonči, až ucítíš uvolnění protahovaných svalů, ne bolest.']::text[],
  easier_key = NULL,
  harder_key = NULL
WHERE canonical_key = 'cooldown';

-- ---------------------------------------------------------------------------
-- 3) Zbývajících ~183 cviků: odvodit easier_key/harder_key ze stejného
--    primary_muscle a nejbližší nižší/vyšší úrovně (level) — JEDNÍM UPDATEm
--    s korelovaným poddotazem, ne ručně po řádku.
--
--    Pomocná funkce převádí level na pořadové číslo, aby šlo porovnávat
--    "nižší"/"vyšší" a řadit podle vzdálenosti (nejbližší úroveň vyhrává,
--    ne rovnou expert). IMMUTABLE — čistá funkce nad textovým vstupem,
--    žádný přístup k tabulce.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exercise_level_ordinal(p_level text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE p_level
    WHEN 'beginner' THEN 1
    WHEN 'intermediate' THEN 2
    WHEN 'expert' THEN 3
    ELSE NULL
  END;
$function$;

COMMENT ON FUNCTION public.exercise_level_ordinal(text) IS
  'level (beginner/intermediate/expert) -> pořadové číslo pro porovnání "lehčí/těžší". NULL pro cokoli jiného (např. cviky bez obtížnosti jako warmup/rest/cooldown).';

-- Vyloučeno: 47 klíčů výše, které mají easier_key/harder_key ručně
-- vybrané (i záměrné NULL, viz komentář u pushup.easier_key) — ty se
-- tímhle plošným odvozením nesmí přepsat.
UPDATE public.exercise_asset_registry r
SET
  easier_key = COALESCE(r.easier_key, (
    SELECT e.canonical_key
    FROM public.exercise_asset_registry e
    WHERE e.primary_muscle = r.primary_muscle
      AND e.canonical_key <> r.canonical_key
      AND public.exercise_level_ordinal(e.level) IS NOT NULL
      AND public.exercise_level_ordinal(r.level) IS NOT NULL
      AND public.exercise_level_ordinal(e.level) < public.exercise_level_ordinal(r.level)
    ORDER BY public.exercise_level_ordinal(e.level) DESC, e.canonical_key ASC
    LIMIT 1
  )),
  harder_key = COALESCE(r.harder_key, (
    SELECT e.canonical_key
    FROM public.exercise_asset_registry e
    WHERE e.primary_muscle = r.primary_muscle
      AND e.canonical_key <> r.canonical_key
      AND public.exercise_level_ordinal(e.level) IS NOT NULL
      AND public.exercise_level_ordinal(r.level) IS NOT NULL
      AND public.exercise_level_ordinal(e.level) > public.exercise_level_ordinal(r.level)
    ORDER BY public.exercise_level_ordinal(e.level) ASC, e.canonical_key ASC
    LIMIT 1
  ))
WHERE r.primary_muscle IS NOT NULL
  AND r.level IS NOT NULL
  AND r.canonical_key NOT IN (
    'bench_press', 'bent_over_row', 'bicep_curl', 'burpee', 'cable_row', 'calf_raise',
    'chest_press', 'dead_bug', 'deadlift', 'dumbbell_romanian_deadlift', 'dumbbell_row',
    'farmer_carry', 'glute_bridge', 'goblet_squat', 'hammer_curl', 'hamstring_curl',
    'lat_pulldown', 'leg_press', 'lunges', 'mountain_climber', 'overhead_press', 'plank',
    'plank_side', 'pushup', 'romanian_deadlift', 'russian_twist', 'squat', 'superman',
    'tricep_extension', 'box_jump', 'bulgarian_squat', 'chest_fly', 'crunch', 'dips',
    'dumbbell_press', 'face_pull', 'hip_thrust', 'incline_bench_press', 'jumping_jack',
    'lateral_raise', 'leg_raise', 'pull_up', 'step_up', 'tricep_dip', 'warmup', 'rest',
    'cooldown'
  );

-- ---------------------------------------------------------------------------
-- 4) Kontroly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bez_urovne integer;
  v_s_postupem integer;
  v_pushup_easier text;
BEGIN
  -- Všech 47 klíčů muselo dostat postup (kromě warmup/rest/cooldown i level).
  SELECT count(*) INTO v_bez_urovne
  FROM public.exercise_asset_registry
  WHERE canonical_key IN (
    'bench_press', 'bent_over_row', 'bicep_curl', 'burpee', 'cable_row', 'calf_raise',
    'chest_press', 'dead_bug', 'deadlift', 'dumbbell_romanian_deadlift', 'dumbbell_row',
    'farmer_carry', 'glute_bridge', 'goblet_squat', 'hammer_curl', 'hamstring_curl',
    'lat_pulldown', 'leg_press', 'lunges', 'mountain_climber', 'overhead_press', 'plank',
    'plank_side', 'pushup', 'romanian_deadlift', 'russian_twist', 'squat', 'superman',
    'tricep_extension', 'box_jump', 'bulgarian_squat', 'chest_fly', 'crunch', 'dips',
    'dumbbell_press', 'face_pull', 'hip_thrust', 'incline_bench_press', 'jumping_jack',
    'lateral_raise', 'leg_raise', 'pull_up', 'step_up', 'tricep_dip', 'warmup', 'rest',
    'cooldown'
  )
  AND (instructions_cs IS NULL OR cardinality(instructions_cs) = 0);
  IF v_bez_urovne > 0 THEN
    RAISE EXCEPTION '% z 47 klíčů zůstalo bez instructions_cs.', v_bez_urovne;
  END IF;

  -- Záměrné NULL (pushup nemá "na kolenou" variantu) se nesmí bulk odvozením přepsat.
  SELECT easier_key INTO v_pushup_easier
  FROM public.exercise_asset_registry WHERE canonical_key = 'pushup';
  IF v_pushup_easier IS NOT NULL THEN
    RAISE EXCEPTION 'pushup.easier_key má být NULL (žádná "na kolenou" varianta v katalogu), je %.', v_pushup_easier;
  END IF;

  SELECT count(*) INTO v_s_postupem
  FROM public.exercise_asset_registry
  WHERE instructions_cs IS NOT NULL AND cardinality(instructions_cs) > 0;
  RAISE NOTICE 'Cviků s českým postupem po migraci: %.', v_s_postupem;
END $$;
