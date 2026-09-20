/**
 * SimpleMealPlannerAgent — deterministický agent-like plánovač START jídelníčku.
 * Source of truth pro initial_plan / initial_7_day_trial. Katalog jen mapuje záměr.
 */
import {
  planMealTypeToWeightKey, slotTargetKcal, jitteredDailyCalorieTarget, mealSlotTypes,
  START_MIN_SCALE, START_MAX_SCALE,
} from '../nutrition/portionScaling.js';
import {
  parseDietaryExclusions,
  isTemplateAllowedForExclusions,
  cheeseFreeAlternativeName,
  cheeseFreeAlternativeNames,
} from '../dietaryExclusions.js';
import { buildDietaryPublishRules, checkCandidateAgainstDiet, preferByMacros } from '../dietaryRules.js';
import { findSimpleStartRecipeByTitle } from '../simpleStartRecipeLibrary.js';

const CZECH_DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

/** Explicitní instrukční blok agenta (pro dokumentaci, testy, případný GPT kontext). */
export const SIMPLE_MEAL_PLANNER_AGENT_INSTRUCTIONS = `Jsi praktický výživový kouč Body & Mind ON.
Tvým cílem není vytvořit zajímavý nebo gurmánský jídelníček.
Tvým cílem je vytvořit jídelníček, který obyčejný člověk opravdu zvládne dodržet.

Pravidla:
- jednoduchost > originalita
- dostupnost > pestrost
- opakovatelnost > složitost
- levné potraviny > exotické potraviny
- rychlá příprava > zajímavý recept
- snídaně a svačiny mají být extrémně jednoduché
- obědy a večeře mají být běžná fitness jídla
- vysoké kalorie řeš větší porcí, ne složitějším receptem
- jídla se mohou opakovat, ale ne každý den stejně
- každý den může mít podobnou strukturu
- uživatel musí hned vědět, co koupit a připravit

Zakázané jako START default:
burrito, slanina jako hlavní snídaně, pomerančové kuře, kokosové kari, ramen, frittata, lasagne,
krabí, salsa, pesto, kaviár, fenykl, baby řepa, vodní zelí, glazura, redukce, quinoa jako častý základ,
chřest jako default, food-blog názvy.`;

const FORBIDDEN_DEFAULT = [
  'burrito',
  'pomeranč',
  'kokos',
  'kari',
  'ramen',
  'frittata',
  'lasagne',
  'krab',
  'salsa',
  'pesto',
  'kaviár',
  'fenykl',
  'glazura',
  'redukce',
  'quinoa',
  'chřest',
  'confit',
  'mexick',
];

/** @typedef {object} StartMealTemplate */
export const START_MEAL_TEMPLATES = {
  standard: {
    breakfast: [
      tpl('Tvaroh s vločkami a banánem', ['tvaroh', 'vločk', 'banán'], fb(420, 28, 52, 10, ['tvaroh 200 g', 'ovesné vločky 50 g', 'banán 1 ks']), 10, 4),
      tpl('Jogurt s ovocem', ['jogurt', 'ovoce', 'banán', 'jablko'], fb(380, 22, 45, 12, ['jogurt 180 g', 'banán nebo jablko 1 ks']), 5, 3),
      tpl('Vejce s pečivem a zeleninou', ['vejce', 'pečivo', 'zelenina'], fb(450, 24, 38, 22, ['vejce 3 ks', 'celozrné pečivo 2 plátky', 'okurka nebo rajče']), 15, 4),
      tpl('Ovesná kaše s proteinem', ['ovesn', 'kaše', 'vločk', 'banán'], fb(400, 14, 58, 12, ['ovesné vločky 60 g', 'mléko 200 ml', 'banán 1 ks']), 10, 4),
      tpl('Cottage s pečivem', ['cottage', 'pečivo'], fb(380, 22, 32, 14, ['cottage 150 g', 'celozrné pečivo 2 plátky', 'zelenina']), 5, 3),
      tpl('Šunka, pečivo a zelenina', ['šunka', 'pečivo', 'zelenina'], fb(400, 22, 32, 21, ['šunka 60 g', 'celozrné pečivo 2 plátky', 'zelenina 100 g']), 5, 4),
      // PROMPT_PRO_CODE.md PR 2 (2026-09-17) — vysokokalorické varianty.
      // Knihovna měla strop breakfast 480 kcal, 33 % profilů v produkci má
      // cíl >= 2400 kcal/den (slot breakfast pak >= ~500-690 kcal). Větší
      // porce existujících jídel, ne nový recept — makra dopočtená ze
      // surovin (viz PR popis), `calories` = 4*protein+4*carbs+9*fat.
      // Pozice v poli je od kaloricky vědomého `pickTemplateForSlot` (PR 3)
      // bezvýznamná — vybírá se podle shody s cílem slotu, ne podle indexu.
      tpl('Ovesná kaše s proteinem, velká porce', ['ovesn', 'kaše', 'vločk', 'protein', 'banán'], fb(578, 40, 82, 10, ['ovesné vločky 70 g', 'mléko 200 ml', 'proteinový prášek 30 g', 'banán 1 ks']), 10, 4),
      tpl('Vejce se šunkou a pečivem, velká porce', ['vejce', 'šunka', 'pečivo', 'zelenina'], fb(668, 54, 50, 28, ['vejce 4 ks', 'šunka 100 g', 'celozrné pečivo 3 plátky', 'zelenina 100 g']), 15, 4),
      // PROMPT_PRO_CODE.md bod C — breakfast měl díru na KAŽDÉM cíli (gate
      // z bodu B), ne jen na okrajích. Doplněno napříč rozsahem 300-700 kcal.
      tpl('Tvaroh s ovesnými vločkami, malá porce', ['tvaroh', 'ovesn', 'vločk', 'banán'], fb(352, 24, 37, 12, ['tvaroh 180 g', 'ovesné vločky 20 g', 'banán 80 g']), 5, 3),
      tpl('Jogurt s müsli a ovocem', ['jogurt', 'müsli', 'ovesn', 'ovoce'], fb(419, 16, 64, 11, ['jogurt 200 g', 'ovesné vločky 60 g', 'banán 80 g']), 3, 3),
      tpl('Vejce se sýrem a pečivem, snídaňové', ['vejce', 'sýr', 'pečivo'], fb(536, 36, 35, 28, ['vejce 3 ks', 'sýr (eidam) 40 g', 'celozrnné pečivo 2 plátky', 'zelenina 100 g']), 15, 4),
      tpl('Tvarohová kaše s ořechy a medem', ['tvaroh', 'kaše', 'ořech', 'med'], fb(587, 35, 51, 27, ['tvaroh 200 g', 'ovesné vločky 50 g', 'mandle 25 g', 'med 10 g']), 5, 4),
      tpl('Sýrová omeleta se zeleninou, vydatná', ['sýr', 'omeleta', 'vejce', 'zelenin'], fb(616, 41, 14, 44, ['vejce 4 ks', 'sýr (eidam) 50 g', 'zelenina 200 g', 'olivový olej 10 g']), 15, 4),
      tpl('Tvarohová kaše s müsli, extra porce', ['tvaroh', 'kaše', 'müsli', 'ovesn'], fb(707, 43, 64, 31, ['tvaroh 250 g', 'ovesné vločky 70 g', 'mandle 25 g', 'med 10 g']), 5, 4),
      // PROMPT_KALORIE_OBSAH.md (2026-09-18) — standard breakfast nemělo
      // dost šablon v pásmu 350/440 kcal (gate FAIL na 1400/2200).
      tpl('Tvaroh s ovesnými vločkami a medem', ['tvaroh', 'ovesn', 'vločk', 'banán', 'med'], fb(405, 25, 56, 9, ['tvaroh 155 g', 'ovesné vločky 38 g', 'banán 95 g', 'med 7 g']), 5, 4),
      tpl('Tvaroh s jahodami a müsli', ['tvaroh', 'jahod', 'müsli'], fb(350, 26, 39, 10, ['tvaroh 190 g', 'jahody 150 g', 'müsli 25 g', 'med 6 g']), 3, 4),
    ],
    snack: [
      tpl('Jogurt s ovocem', ['jogurt', 'ovoce', 'banán'], fb(220, 14, 28, 6, ['jogurt 180 g', 'banán nebo jablko 1 ks']), 3, 2),
      tpl('Tvaroh s ovocem', ['tvaroh', 'ovoce'], fb(240, 20, 22, 8, ['tvaroh 180 g', 'banán 1 ks']), 3, 2),
      tpl('Cottage s pečivem', ['cottage', 'pečivo'], fb(260, 18, 24, 10, ['cottage 150 g', 'celozrné pečivo 1 plátek']), 3, 2),
      tpl('Proteinový nápoj a banán', ['protein', 'banán'], fb(420, 38, 42, 8, ['proteinový prášek 40 g', 'mléko 300 ml', 'banán 1 ks']), 2, 2),
      tpl('Ovesné vločky s tvarohem', ['ovesn', 'tvaroh', 'vločk'], fb(480, 32, 62, 10, ['ovesné vločky 80 g', 'tvaroh 200 g', 'med 15 g']), 5, 3),
      tpl('Rýže s tuňákem', ['rýž', 'tuňák'], fb(450, 32, 52, 10, ['rýže 70 g', 'tuňák ve vlastní šťávě 1 konzerva', 'olivový olej 10 ml']), 15, 3),
      tpl('Cottage s ořechy a pečivem', ['cottage', 'ořech', 'pečivo'], fb(460, 30, 32, 24, ['cottage 200 g', 'ořechy 30 g', 'celozrnné pečivo 2 plátky']), 3, 3),
      tpl('Chleba s arašídovým máslem a banánem', ['chleba', 'arašíd', 'banán'], fb(470, 16, 48, 24, ['celozrnné pečivo 2 plátky', 'arašídové máslo 30 g', 'banán 1 ks']), 3, 3),
      tpl('Sendvič se šunkou', ['sendvič', 'šunka', 'pečivo'], fb(280, 18, 28, 10, ['celozrné pečivo 2 plátky', 'šunka 60 g', 'zelenina']), 5, 4),
      tpl('Vejce natvrdo se zeleninou', ['vejce', 'natvrdo', 'zelenina'], fb(250, 16, 8, 16, ['vejce 2 ks', 'zelenina 100 g']), 10, 2),
      tpl('Kefír a pečivo', ['kefír', 'pečivo'], fb(230, 12, 28, 8, ['kefír 250 ml', 'celozrné pečivo 1 plátek']), 2, 2),
      // PROMPT_PRO_CODE.md bod C, priorita 1 (2026-09-17, 23 uživatelů).
      // Standard svačiny pokrývaly jen 220-480 kcal — na cíl 1400-2000 kcal/den
      // (slot 140-280 kcal) nesedělo do START_MIN_SCALE..START_MAX_SCALE nic.
      // Doplněno na okrajích rozsahu, ne dalšími variantami středu.
      tpl('Jablko s tvarohem', ['jablko', 'tvaroh'], fb(140, 7, 19, 4, ['tvaroh 60 g', 'jablko 1 ks']), 3, 2),
      tpl('Vejce se sýrem', ['vejce', 'sýr'], fb(138, 11, 1, 10, ['vejce 1 ks', 'sýr (eidam) 20 g']), 5, 2),
      tpl('Řecký jogurt s medem', ['řecký', 'jogurt', 'med'], fb(153, 19, 17, 1, ['řecký jogurt bílý 190 g', 'med 12 g']), 2, 2),
      tpl('Mrkev s hummusem', ['mrkev', 'hummus'], fb(140, 5, 21, 4, ['mrkev 150 g', 'hummus 40 g']), 3, 2),
      tpl('Cottage s jablkem', ['cottage', 'jablko'], fb(302, 25, 28, 10, ['cottage 220 g', 'jablko 1 ks (150 g)']), 3, 2),
      tpl('Tuňákový chlebíček', ['tuňák', 'chlebíček', 'pečivo'], fb(291, 35, 31, 3, ['tuňák ve vlastní šťávě 120 g', 'celozrnné pečivo 2 plátky', 'zelenina 60 g']), 10, 3),
      tpl('Tvarohový dezert s ovesnými vločkami', ['tvaroh', 'dezert', 'ovesn', 'vločk'], fb(373, 26, 38, 13, ['tvaroh 180 g', 'ovesné vločky 40 g', 'med 10 g']), 5, 3),
      tpl('Cottage s banánem a ořechy', ['cottage', 'banán', 'ořech'], fb(485, 27, 38, 25, ['cottage 200 g', 'banán 1 ks', 'vlašské ořechy 25 g']), 3, 3),
      // Druhé kolo (2026-09-17) — po prvním doplnění zůstaly díry 252-392
      // (23 uživatelů, cíle 1800-2800). Cílí přímo na tohle pásmo.
      tpl('Jogurt s ovesnými vločkami', ['jogurt', 'ovesn', 'vločk'], fb(239, 25, 28, 3, ['bílý jogurt 200 g', 'ovesné vločky 35 g']), 3, 2),
      tpl('Cottage se zeleninou', ['cottage', 'zelenin'], fb(303, 30, 21, 11, ['cottage 250 g', 'zelenina 200 g']), 3, 2),
      tpl('Vaječná svačina se šunkou', ['vejce', 'šunka', 'pečivo'], fb(346, 26, 29, 14, ['vejce 2 ks', 'šunka 40 g', 'celozrnné pečivo 2 plátky']), 10, 3),
      tpl('Sýrový talíř s pečivem', ['sýr', 'pečivo', 'zelenin'], fb(382, 23, 32, 18, ['sýr (eidam) 70 g', 'celozrnné pečivo 2 plátky', 'zelenina 80 g']), 3, 3),
      // Třetí kolo — 1600-2200 a 3300-3900 pořád pod potřebou.
      tpl('Kefír s ovocem', ['kefír', 'ovoce', 'banán'], fb(271, 11, 32, 11, ['kefír 300 ml', 'banán 1 ks (80 g)']), 2, 2),
      tpl('Sendvič se sýrem a šunkou, vydatný', ['sendvič', 'sýr', 'šunka', 'pečivo'], fb(406, 29, 41, 14, ['celozrnné pečivo 3 plátky', 'šunka 60 g', 'sýr (eidam) 40 g']), 5, 3),
      tpl('Tvarohová bomba s müsli a ořechy', ['tvaroh', 'müsli', 'ovesn', 'ořech'], fb(490, 33, 40, 22, ['tvaroh 200 g', 'ovesné vločky 50 g', 'mandle 15 g']), 5, 3),
      // Čtvrté kolo — poslední zbylé díry (1600, 1800/2000 okraj, 3300-3900).
      tpl('Cottage s okurkou', ['cottage', 'okurka'], fb(154, 15, 10, 6, ['cottage 130 g', 'okurka 150 g']), 3, 2),
      tpl('Cottage s banánem', ['cottage', 'banán'], fb(247, 18, 28, 7, ['cottage 150 g', 'banán 1 ks']), 3, 2),
      tpl('Toust se šunkou a vejcem', ['toust', 'šunka', 'vejce', 'pečivo'], fb(448, 34, 42, 16, ['celozrnné pečivo 3 plátky', 'šunka 70 g', 'vejce 2 ks']), 10, 3),
      tpl('Ořechovo-tvarohová mísa s banánem', ['ořech', 'tvaroh', 'banán'], fb(489, 26, 40, 25, ['tvaroh 150 g', 'banán 1 ks', 'mandle 33 g']), 5, 3),
      tpl('Kuřecí wrap malý', ['kuřec', 'wrap', 'tortilla', 'zelenin'], fb(401, 38, 42, 9, ['kuřecí prsa 100 g', 'tortilla 1,5 ks (75 g)', 'zelenina 70 g']), 15, 3),
      tpl('Vejce se sýrem a pečivem, vydatné', ['vejce', 'sýr', 'pečivo'], fb(457, 30, 28, 25, ['vejce 2 ks', 'sýr (eidam) 50 g', 'celozrnné pečivo 2 plátky']), 10, 3),
      tpl('Tuňákový talíř s pečivem, vydatný', ['tuňák', 'pečivo'], fb(466, 44, 41, 14, ['tuňák ve vlastní šťávě 150 g', 'celozrnné pečivo 3 plátky', 'olivový olej 10 g']), 10, 3),
      // Páté kolo — přepočet po dokončení ukázal 1 chybějící šablonu na
      // 2200/2400 kcal a 1 na 3300/3900 kcal (gate z bodu B).
      tpl('Tvaroh s jahodami', ['tvaroh', 'jahod'], fb(329, 26, 27, 13, ['tvaroh 220 g', 'jahody 150 g', 'med 10 g']), 3, 3),
      tpl('Sýrový sendvič s vejcem, vydatný', ['sýr', 'sendvič', 'vejce', 'pečivo'], fb(431, 28, 28, 23, ['sýr (eidam) 65 g', 'celozrnné pečivo 2 plátky', 'vejce 1 ks']), 10, 3),
    ],
    lunch: [
      tpl('Kuře s rýží a zeleninou', ['kuře', 'rýž', 'zelenin'], fb(620, 42, 65, 16, ['kuřecí prsa 150 g', 'rýže 80 g', 'zelenina 150 g', 'olivový olej 1 lžíce']), 25, 5),
      // PROMPT_KALORIE_OBSAH.md (2026-09-18) — standard lunch nemělo dost
      // šablon v pásmu 490/560/672 kcal (gate FAIL na 1400/1600/2000/2400).
      tpl('Krůtí prsa s těstovinami a zeleninou', ['krůtí', 'těstovin', 'zelenin'], fb(564, 55, 59, 12, ['krůtí prsa 150 g', 'těstoviny 70 g', 'zelenina 150 g', 'olivový olej 8 g']), 25, 4),
      tpl('Hovězí s bramborem a zeleninou', ['hovězí', 'brambor', 'zelenin'], fb(689, 47, 60, 29, ['hovězí maso 180 g', 'brambory 300 g', 'zelenina 150 g', 'olivový olej 8 g']), 30, 4),
      tpl('Losos s rýží a zeleninou', ['losos', 'rýž', 'zelenin'], fb(678, 39, 72, 26, ['losos 150 g', 'rýže 80 g', 'zelenina 150 g', 'olivový olej 5 g']), 25, 4),
      tpl('Brambory s vejcem', ['brambor', 'vejce'], fb(580, 40, 48, 25, ['brambory 300 g', 'vejce 2 ks', 'zelenina 100 g']), 30, 5),
      tpl('Těstoviny s tuňákem', ['těstovin', 'tuňák'], fb(600, 38, 68, 14, ['těstoviny 80 g', 'tuňák ve vlastní šťávě 1 konzerva', 'zelenina 100 g']), 20, 4),
      tpl('Rýže s vejcem a zeleninou', ['rýž', 'vejce', 'zelenin'], fb(540, 22, 72, 14, ['rýže 80 g', 'vejce 2 ks', 'zelenina 150 g', 'olivový olej 1 lžíce']), 20, 5),
      tpl('Čočka s vejcem', ['čočk', 'vejce', 'zelenin'], fb(550, 32, 58, 16, ['čočka 80 g', 'vejce 2 ks', 'zelenina 150 g']), 25, 5),
      tpl('Fazole s rýží', ['fazole', 'rýž'], fb(520, 24, 78, 12, ['fazole 1 konzerva', 'rýže 70 g', 'zelenina 100 g']), 25, 4),
      tpl('Kuřecí tortilla jednoduchá', ['kuřec', 'tortilla', 'zelenin'], fb(580, 38, 55, 18, ['kuřecí prsa 120 g', 'tortilla 2 ks', 'zelenina 150 g'], ['pomeranč', 'kari', 'salsa']), 20, 5),
      // PROMPT_PRO_CODE.md PR 2 — lunch strop byl 640 kcal, cíl slotu při
      // vysokém denním cíli je až ~999 kcal. Dvě různé základní jídla (rýže
      // s kuřetem, těstoviny s kuřetem), ne dvě velikosti téhož — jinak by
      // `MIN_DISTINCT_BY_TYPE` i tak vracel pořád totéž.
      tpl('Kuře s rýží a zeleninou, velká porce', ['kuře', 'rýž', 'zelenin'], fb(815, 71, 81, 23, ['kuřecí prsa 200 g', 'rýže 90 g', 'zelenina 150 g', 'olivový olej 15 g']), 25, 4),
      tpl('Těstoviny s kuřetem, velká porce', ['těstovin', 'kuře'], fb(1009, 88, 108, 25, ['těstoviny 140 g', 'kuřecí prsa 220 g', 'zelenina 150 g', 'olivový olej 15 g']), 25, 4),
    ],
    dinner: [
      tpl('Omeleta se zeleninou', ['omeleta', 'vejce', 'zelenin'], fb(480, 32, 18, 28, ['vejce 3 ks', 'zelenina 200 g', 'olivový olej 1 lžíce']), 15, 4),
      tpl('Tuňákový salát s pečivem', ['tuňák', 'salát', 'pečivo'], fb(520, 36, 42, 18, ['tuňák ve vlastní šťávě 1 konzerva', 'zelenina 150 g', 'celozrné pečivo 2 plátky']), 10, 4),
      tpl('Kuře se zeleninou', ['kuře', 'zelenin'], fb(500, 42, 20, 28, ['kuřecí prsa 150 g', 'zelenina 250 g', 'olivový olej 1 lžíce']), 25, 4),
      tpl('Brambory s vejcem', ['brambor', 'vejce'], fb(500, 20, 52, 22, ['brambory 300 g', 'vejce 2 ks', 'zelenina 100 g']), 25, 4),
      tpl('Tvarohová miska', ['tvaroh', 'banán'], fb(420, 34, 32, 14, ['tvaroh 250 g', 'banán 1 ks', 'mandle 15 g']), 5, 3),
      tpl('Cottage talíř', ['cottage', 'pečivo', 'zelenin'], fb(440, 32, 28, 18, ['cottage 200 g', 'pečivo 1 plátek', 'zelenina 150 g']), 5, 4),
      tpl('Těstoviny s kuřetem', ['těstovin', 'kuře'], fb(560, 40, 62, 16, ['těstoviny 80 g', 'kuřecí prsa 120 g', 'zelenina 100 g']), 25, 4),
      // PROMPT_PRO_CODE.md PR 2 — dinner strop byl 520 kcal, cíl slotu při
      // vysokém denním cíli je až ~768 kcal.
      tpl('Kuře se zeleninou, velká porce', ['kuře', 'zelenin'], fb(625, 73, 18, 29, ['kuřecí prsa 220 g', 'zelenina 300 g', 'olivový olej 20 g']), 25, 3),
      tpl('Kuřecí steak s bramborem a zeleninou, velká porce', ['kuřec', 'brambor', 'zelenin'], fb(751, 71, 65, 23, ['kuřecí prsa 200 g', 'brambory 330 g', 'zelenina 150 g', 'olivový olej 15 g']), 30, 4),
      // PROMPT_KALORIE_OBSAH.md (2026-09-18) — standard dinner nemělo dost
      // šablon v pásmu 480/528/576 kcal (gate FAIL na 1600/2000/2200/2400).
      tpl('Krůtí prsa s bramborem a zeleninou', ['krůtí', 'brambor', 'zelenin'], fb(486, 56, 43, 10, ['krůtí prsa 170 g', 'brambory 200 g', 'zelenina 150 g', 'olivový olej 6 g']), 25, 4),
      tpl('Losos se zeleninou a bramborem', ['losos', 'zelenin', 'brambor'], fb(544, 41, 32, 28, ['losos 170 g', 'zelenina 250 g', 'brambory 100 g', 'olivový olej 5 g']), 25, 4),
      tpl('Hovězí s rýží a zeleninou', ['hovězí', 'rýž', 'zelenin'], fb(630, 40, 59, 26, ['hovězí maso 150 g', 'rýže 60 g', 'zelenina 200 g', 'olivový olej 8 g']), 25, 4),
    ],
  },
  vegetarian: {
    breakfast: [
      tpl('Tvaroh s vločkami a banánem', ['tvaroh', 'vločk', 'banán'], fb(420, 28, 52, 10, ['tvaroh 200 g', 'ovesné vločky 50 g', 'banán 1 ks']), 10, 4),
      tpl('Jogurt s ovocem', ['jogurt', 'ovoce'], fb(380, 22, 45, 12, ['jogurt 180 g', 'banán nebo jablko 1 ks']), 5, 3),
      tpl('Vejce s pečivem a zeleninou', ['vejce', 'pečivo'], fb(450, 24, 38, 22, ['vejce 3 ks', 'celozrné pečivo 2 plátky', 'zelenina']), 15, 4),
      tpl('Ovesná kaše s proteinem', ['ovesn', 'kaše', 'vločk'], fb(400, 14, 58, 12, ['ovesné vločky 60 g', 'mléko 200 ml', 'banán 1 ks']), 10, 4),
      tpl('Cottage s pečivem', ['cottage', 'pečivo'], fb(380, 22, 32, 14, ['cottage 150 g', 'celozrné pečivo 2 plátky']), 5, 3),
      tpl('Ovesná kaše s proteinem, velká porce', ['ovesn', 'kaše', 'vločk', 'protein', 'banán'], fb(578, 40, 82, 10, ['ovesné vločky 70 g', 'mléko 200 ml', 'proteinový prášek 30 g', 'banán 1 ks']), 10, 4),
      tpl('Tvaroh s ovesnými vločkami, malá porce', ['tvaroh', 'ovesn', 'vločk', 'banán'], fb(352, 24, 37, 12, ['tvaroh 180 g', 'ovesné vločky 20 g', 'banán 80 g']), 5, 3),
      tpl('Jogurt s müsli a ovocem', ['jogurt', 'müsli', 'ovesn', 'ovoce'], fb(419, 16, 64, 11, ['jogurt 200 g', 'ovesné vločky 60 g', 'banán 80 g']), 3, 3),
      tpl('Vejce se sýrem a pečivem, snídaňové', ['vejce', 'sýr', 'pečivo'], fb(536, 36, 35, 28, ['vejce 3 ks', 'sýr (eidam) 40 g', 'celozrnné pečivo 2 plátky', 'zelenina 100 g']), 15, 4),
      tpl('Tvarohová kaše s ořechy a medem', ['tvaroh', 'kaše', 'ořech', 'med'], fb(587, 35, 51, 27, ['tvaroh 200 g', 'ovesné vločky 50 g', 'mandle 25 g', 'med 10 g']), 5, 4),
      tpl('Sýrová omeleta se zeleninou, vydatná', ['sýr', 'omeleta', 'vejce', 'zelenin'], fb(616, 41, 14, 44, ['vejce 4 ks', 'sýr (eidam) 50 g', 'zelenina 200 g', 'olivový olej 10 g']), 15, 4),
      tpl('Tvarohová kaše s müsli, extra porce', ['tvaroh', 'kaše', 'müsli', 'ovesn'], fb(707, 43, 64, 31, ['tvaroh 250 g', 'ovesné vločky 70 g', 'mandle 25 g', 'med 10 g']), 5, 4),
      // PROMPT_KALORIE_OBSAH.md (2026-09-18) — vegetarian breakfast nemělo
      // dost šablon v pásmu 350/440 kcal (gate FAIL na 1400/2200). Stejné
      // recepty jako standard výš — knihovna je sdílená podle názvu.
      tpl('Tvaroh s ovesnými vločkami a medem', ['tvaroh', 'ovesn', 'vločk', 'banán', 'med'], fb(405, 25, 56, 9, ['tvaroh 155 g', 'ovesné vločky 38 g', 'banán 95 g', 'med 7 g']), 5, 4),
      tpl('Tvaroh s jahodami a müsli', ['tvaroh', 'jahod', 'müsli'], fb(350, 26, 39, 10, ['tvaroh 190 g', 'jahody 150 g', 'müsli 25 g', 'med 6 g']), 3, 4),
    ],
    snack: [
      tpl('Jogurt s ovocem', ['jogurt', 'ovoce'], fb(220, 14, 28, 6, ['jogurt 180 g', 'banán 1 ks']), 3, 2),
      tpl('Tvaroh s ovocem', ['tvaroh', 'ovoce'], fb(240, 20, 22, 8, ['tvaroh 180 g', 'banán 1 ks']), 3, 2),
      tpl('Cottage s pečivem', ['cottage', 'pečivo'], fb(260, 18, 24, 10, ['cottage 150 g', 'pečivo 1 plátek']), 3, 2),
      tpl('Ovesné vločky s tvarohem', ['ovesn', 'tvaroh', 'vločk'], fb(480, 32, 62, 10, ['ovesné vločky 80 g', 'tvaroh 200 g', 'med 15 g']), 5, 3),
      tpl('Cottage s ořechy a pečivem', ['cottage', 'ořech', 'pečivo'], fb(460, 30, 32, 24, ['cottage 200 g', 'ořechy 30 g', 'celozrnné pečivo 2 plátky']), 3, 3),
      tpl('Chleba s arašídovým máslem a banánem', ['chleba', 'arašíd', 'banán'], fb(470, 16, 48, 24, ['celozrnné pečivo 2 plátky', 'arašídové máslo 30 g', 'banán 1 ks']), 3, 3),
      tpl('Kefír a pečivo', ['kefír', 'pečivo'], fb(230, 12, 28, 8, ['kefír 250 ml', 'pečivo 1 plátek']), 2, 2),
      // PROMPT_PRO_CODE.md bod C, priorita 2 (2026-09-17, 7 uživatelů,
      // cíle 1386-2320). Stejné maso/rybí-prosté svačiny jako standard výš —
      // stejný recept v knihovně (podle titulu), jen doplněné do tohoto balíku.
      tpl('Jablko s tvarohem', ['jablko', 'tvaroh'], fb(140, 7, 19, 4, ['tvaroh 60 g', 'jablko 1 ks']), 3, 2),
      tpl('Vejce se sýrem', ['vejce', 'sýr'], fb(138, 11, 1, 10, ['vejce 1 ks', 'sýr (eidam) 20 g']), 5, 2),
      tpl('Řecký jogurt s medem', ['řecký', 'jogurt', 'med'], fb(153, 19, 17, 1, ['řecký jogurt bílý 190 g', 'med 12 g']), 2, 2),
      tpl('Mrkev s hummusem', ['mrkev', 'hummus'], fb(140, 5, 21, 4, ['mrkev 150 g', 'hummus 40 g']), 3, 2),
      tpl('Cottage s jablkem', ['cottage', 'jablko'], fb(302, 25, 28, 10, ['cottage 220 g', 'jablko 1 ks (150 g)']), 3, 2),
      tpl('Tvarohový dezert s ovesnými vločkami', ['tvaroh', 'dezert', 'ovesn', 'vločk'], fb(373, 26, 38, 13, ['tvaroh 180 g', 'ovesné vločky 40 g', 'med 10 g']), 5, 3),
      tpl('Cottage s banánem a ořechy', ['cottage', 'banán', 'ořech'], fb(485, 27, 38, 25, ['cottage 200 g', 'banán 1 ks', 'vlašské ořechy 25 g']), 3, 3),
      tpl('Jogurt s ovesnými vločkami', ['jogurt', 'ovesn', 'vločk'], fb(239, 25, 28, 3, ['bílý jogurt 200 g', 'ovesné vločky 35 g']), 3, 2),
      tpl('Cottage se zeleninou', ['cottage', 'zelenin'], fb(303, 30, 21, 11, ['cottage 250 g', 'zelenina 200 g']), 3, 2),
      tpl('Sýrový talíř s pečivem', ['sýr', 'pečivo', 'zelenin'], fb(382, 23, 32, 18, ['sýr (eidam) 70 g', 'celozrnné pečivo 2 plátky', 'zelenina 80 g']), 3, 3),
      tpl('Kefír s ovocem', ['kefír', 'ovoce', 'banán'], fb(271, 11, 32, 11, ['kefír 300 ml', 'banán 1 ks (80 g)']), 2, 2),
      tpl('Tvarohová bomba s müsli a ořechy', ['tvaroh', 'müsli', 'ovesn', 'ořech'], fb(490, 33, 40, 22, ['tvaroh 200 g', 'ovesné vločky 50 g', 'mandle 15 g']), 5, 3),
      tpl('Cottage s okurkou', ['cottage', 'okurka'], fb(154, 15, 10, 6, ['cottage 130 g', 'okurka 150 g']), 3, 2),
      tpl('Cottage s banánem', ['cottage', 'banán'], fb(247, 18, 28, 7, ['cottage 150 g', 'banán 1 ks']), 3, 2),
      tpl('Ořechovo-tvarohová mísa s banánem', ['ořech', 'tvaroh', 'banán'], fb(489, 26, 40, 25, ['tvaroh 150 g', 'banán 1 ks', 'mandle 33 g']), 5, 3),
      tpl('Vejce se sýrem a pečivem, vydatné', ['vejce', 'sýr', 'pečivo'], fb(457, 30, 28, 25, ['vejce 2 ks', 'sýr (eidam) 50 g', 'celozrnné pečivo 2 plátky']), 10, 3),
      // PROMPT_KALORIE_OBSAH.md (2026-09-18) — vegetarian snack nemělo dost
      // šablon v pásmu 252-336 kcal (gate FAIL na 1800/2000/2200/2400).
      tpl('Cottage s banánem a skořicí', ['cottage', 'banán', 'skořic'], fb(289, 24, 28, 9, ['cottage 210 g', 'banán 1 ks (85 g)', 'skořice']), 3, 3),
      tpl('Řecký jogurt s ořechy a medem', ['řecký', 'jogurt', 'ořech', 'med'], fb(293, 25, 19, 13, ['řecký jogurt bílý 220 g', 'ořechy 20 g', 'med 10 g']), 2, 3),
      tpl('Tvarohový puding s ořechy a medem', ['tvaroh', 'puding', 'ořech', 'med'], fb(330, 26, 16, 18, ['tvaroh 200 g', 'ořechy 16 g', 'med 8 g']), 3, 3),
    ],
    lunch: [
      tpl('Rýže s vejcem a zeleninou', ['rýž', 'vejce', 'zelenin'], fb(540, 22, 72, 14, ['rýže 80 g', 'vejce 2 ks', 'zelenina 150 g']), 20, 5),
      tpl('Čočka s vejcem', ['čočk', 'vejce'], fb(550, 32, 58, 16, ['čočka 80 g', 'vejce 2 ks', 'zelenina 150 g']), 25, 5),
      tpl('Fazole s rýží', ['fazole', 'rýž'], fb(520, 24, 78, 12, ['fazole 1 konzerva', 'rýže 70 g', 'zelenina 100 g']), 25, 4),
      tpl('Těstoviny se zeleninou', ['těstovin', 'zelenin'], fb(520, 16, 78, 14, ['těstoviny 80 g', 'zelenina 200 g', 'olivový olej 1 lžíce']), 20, 4),
      // PROMPT_KALORIE_OBSAH.md (2026-09-18) — hlavní nález: vegetarian
      // lunch měl na CELÝ týden a VŠECHNA pásma jen 4 šablony (standard 9).
      // Pool se staví, ne záplatuje — 6 nových jídel rozprostřených přes
      // 460-700 kcal, s bílkovinami z luštěnin/vajec/cottage/sýra (bod 6).
      tpl('Fazolový salát se sýrem', ['fazol', 'sýr', 'zelenin'], fb(460, 27, 43, 20, ['fazole 200 g (1 konzerva)', 'sýr (eidam) 40 g', 'zelenina 200 g', 'olivový olej 8 g']), 15, 4),
      tpl('Quinoa s čočkou a zeleninou', ['quinoa', 'čočk', 'zelenin'], fb(572, 30, 86, 12, ['quinoa 40 g', 'čočka 80 g', 'zelenina 200 g', 'olivový olej 8 g']), 30, 4),
      tpl('Sladké brambory s cottage a zeleninou', ['sladké brambor', 'cottage', 'zelenin'], fb(605, 30, 83, 17, ['sladké brambory 350 g', 'cottage 200 g', 'zelenina 100 g', 'olivový olej 8 g']), 25, 4),
      tpl('Quinoa se sýrem, avokádem a rajčaty', ['quinoa', 'sýr', 'avokád', 'rajč'], fb(609, 30, 57, 29, ['quinoa 60 g', 'sýr (eidam) 65 g', 'avokádo 50 g', 'zelenina 150 g', 'rajčata 100 g']), 20, 5),
      tpl('Čočkové kari s rýží a zeleninou', ['čočk', 'kari', 'rýž', 'zelenin'], fb(700, 30, 118, 12, ['čočka 85 g', 'rýže 70 g', 'zelenina 200 g', 'olivový olej 10 g']), 30, 4),
      tpl('Vejce se sladkými bramborami a zeleninou', ['vejce', 'sladké brambor', 'zelenin'], fb(503, 23, 60, 19, ['vejce 2 ks (120 g)', 'sladké brambory 250 g', 'zelenina 150 g', 'olivový olej 5 g']), 25, 4),
    ],
    dinner: [
      tpl('Omeleta se zeleninou', ['omeleta', 'vejce'], fb(480, 32, 18, 28, ['vejce 3 ks', 'zelenina 200 g']), 15, 4),
      tpl('Brambory s vejcem', ['brambor', 'vejce'], fb(500, 20, 52, 22, ['brambory 300 g', 'vejce 2 ks']), 25, 4),
      tpl('Tvarohová miska', ['tvaroh'], fb(420, 34, 32, 14, ['tvaroh 250 g', 'banán 1 ks']), 5, 3),
      tpl('Cottage talíř', ['cottage', 'zelenin'], fb(440, 32, 28, 18, ['cottage 200 g', 'zelenina 150 g', 'pečivo 1 plátek']), 5, 4),
      // PROMPT_KALORIE_OBSAH.md (2026-09-18) — stejný nález jako u obědu:
      // vegetarian dinner měl jen 4 šablony na celý týden a všechna pásma.
      tpl('Fazolová pánev se sýrem a zeleninou', ['fazol', 'sýr', 'zelenin'], fb(506, 30, 47, 22, ['fazole 230 g', 'sýr (eidam) 45 g', 'zelenina 200 g', 'olivový olej 8 g']), 20, 4),
      tpl('Cottage se špenátem a bramborem', ['cottage', 'špenát', 'brambor'], fb(382, 27, 37, 14, ['cottage 180 g', 'špenát 150 g', 'brambory 150 g', 'olivový olej 6 g']), 20, 4),
      tpl('Vejce se sýrem a bramborem', ['vejce', 'sýr', 'brambor'], fb(611, 33, 50, 31, ['vejce 2 ks (120 g)', 'sýr (eidam) 40 g', 'brambory 250 g', 'zelenina 100 g', 'olivový olej 6 g']), 25, 5),
      tpl('Čočkové karbanátky se zeleninou', ['čočk', 'karbanát', 'zelenin'], fb(553, 33, 67, 17, ['čočka 90 g', 'vejce 1 ks (50 g)', 'zelenina 200 g', 'olivový olej 10 g']), 25, 4),
      tpl('Cottage s quinoou, zeleninou a ořechy', ['cottage', 'quinoa', 'zelenin', 'ořech'], fb(603, 39, 60, 23, ['cottage 220 g', 'quinoa 60 g', 'zelenina 200 g', 'vlašské ořechy 15 g']), 20, 4),
    ],
  },
  vegan: {
    breakfast: [
      tpl('Ovesná kaše s ovocem', ['ovesn', 'vločk', 'banán'], fb(380, 12, 62, 10, ['ovesné vločky 60 g', 'rostlinné mléko 200 ml', 'banán 1 ks']), 10, 3),
      tpl('Chleba s arašídovým máslem a banánem', ['chleba', 'banán', 'arašíd'], fb(420, 14, 52, 16, ['celozrné pečivo 2 plátky', 'arašídové máslo 30 g', 'banán 1 ks']), 5, 3),
    ],
    snack: [
      tpl('Ovoce a ořechy', ['ovoce', 'ořech', 'banán'], fb(250, 8, 28, 12, ['banán 1 ks', 'mandle 20 g']), 2, 2),
      tpl('Hummus a pečivo', ['hummus', 'pečivo'], fb(280, 10, 32, 12, ['hummus 80 g', 'celozrné pečivo 2 plátky']), 3, 2),
    ],
    lunch: [
      tpl('Fazole s rýží', ['fazole', 'rýž'], fb(520, 24, 78, 12, ['fazole 1 konzerva', 'rýže 70 g', 'zelenina 100 g']), 25, 4),
      tpl('Čočka se zeleninou', ['čočk', 'zelenin'], fb(500, 26, 68, 10, ['čočka 80 g', 'zelenina 200 g']), 25, 4),
      tpl('Těstoviny se zeleninou', ['těstovin', 'zelenin'], fb(520, 16, 78, 14, ['těstoviny 80 g', 'zelenina 200 g']), 20, 4),
    ],
    dinner: [
      tpl('Brambory se zeleninou', ['brambor', 'zelenin'], fb(480, 10, 58, 23, ['brambory 350 g', 'zelenina 200 g', 'olivový olej 1 lžíce']), 25, 4),
      tpl('Rýže s fazolemi', ['rýž', 'fazole'], fb(500, 22, 82, 10, ['rýže 80 g', 'fazole 1 konzerva', 'zelenina 100 g']), 25, 4),
    ],
  },
};

function fb(kcal, protein_g, carbs_g, fat_g, shopping_ingredient_lines) {
  return { kcal, protein_g, carbs_g, fat_g, shopping_ingredient_lines };
}

function tpl(name_cs, allowed, fallback, prep_time_max_minutes, max_main_ingredients, extraForbidden = []) {
  return {
    name_cs,
    allowed_catalog_match_terms: allowed,
    forbidden_catalog_terms: [...FORBIDDEN_DEFAULT, ...extraForbidden],
    fallback_meal_template: { name_cs, ...fallback },
    prep_time_max_minutes,
    max_main_ingredients,
  };
}

export function resolveMealsPerDay(bodyMetrics, mealsPerDayIn) {
  if (mealsPerDayIn != null) return mealsPerDayIn;
  const cal = Number(bodyMetrics?.calories_target);
  if (Number.isFinite(cal)) {
    if (cal > 3200) return 6;
    if (cal >= 1800) return 5;
    return 4;
  }
  const n = Number(bodyMetrics?.meals_per_day);
  if (Number.isFinite(n) && n >= 2 && n <= 6) return n;
  return 4;
}

function resolveTargets(bodyMetrics, targets) {
  if (targets?.calories_per_day) return targets;
  const ct = Number(bodyMetrics?.calories_target);
  const calories = Number.isFinite(ct) && ct >= 1000 ? Math.round(ct) : 2200;
  const weight = Number(bodyMetrics?.weight_kg) || 70;
  const goal = String(bodyMetrics?.goal || 'udrzovani').toLowerCase();
  let protein = Math.round(weight * 1.6);
  if (goal === 'redukce') protein = Math.round(weight * 1.8);
  if (goal === 'nabirani_svaly') protein = Math.round(weight * 2.0);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { calories_per_day: calories, protein_g: protein, carbs_g: carbs, fat_g: fat };
}

/**
 * Který BALÍK šablon se použije. Existují tři (standard, vegetarian, vegan),
 * protože se liší celým obsahem — vegan nemá vejce ani tvaroh.
 *
 * Ostatní diety (gluten_free, lactose_free, low_carb) vlastní balík NEMAJÍ
 * a mít nemají: byla by to druhá ručně udržovaná databáze jídel, kterou nic
 * neporovnává s katalogem ani s bránou. Řeší se FILTREM balíku `standard`
 * v `poolForDiet()` — jedna sada dat, jedno rozhodování o dietě.
 */
function dietKey(bodyMetrics) {
  const d = String(bodyMetrics?.diet_type || 'standard').toLowerCase();
  if (d === 'vegan') return 'vegan';
  if (d === 'vegetarian') return 'vegetarian';
  return 'standard';
}

/**
 * Vyfiltruje šablony slotu tak, aby se pro danou dietu vůbec smělo navrhnout.
 *
 * Do 10. 8. 2026 tenhle filtr neexistoval a bezlepkovému uživateli plánovač
 * navrhl „Kuřecí tortilla“, „Cottage s pečivem“ a „Cottage s ořechy a pečivem“
 * — změřeno 4 z 10 slotů. Brána je pak odmítla, ale to už byl plán hotový.
 *
 * Když po filtru nezbude nic, vrací se PRÁZDNÝ pool a volající to musí řešit
 * (viz `pickTemplateForSlot`). Tiché propadnutí na `pool[0]` by vrátilo přesně
 * to jídlo, které dietu porušuje.
 *
 * @param {Array<object>} pool
 * @param {ReturnType<typeof buildDietaryPublishRules>} rules
 * @param {string} mealType jen do logu
 * @returns {Array<object>}
 */
function poolForDiet(pool, rules, mealType) {
  if (!Array.isArray(pool) || !pool.length) return [];
  const kept = [];
  const dropped = [];
  for (const tpl of pool) {
    const verdict = checkCandidateAgainstDiet(tpl, rules);
    if (verdict.ok) kept.push(tpl);
    else dropped.push(`${tpl.name_cs} (${verdict.code}${verdict.matched_term ? `: ${verdict.matched_term}` : ''})`);
  }
  if (dropped.length) {
    console.log('[simple-meal-planner-agent] sablony vyrazene dietou', {
      meal_type: mealType,
      diet_type: rules.dietType,
      kept: kept.length,
      dropped: dropped.length,
      dropped_detail: dropped,
    });
  }
  if (!kept.length) {
    console.error('[simple-meal-planner-agent] ZADNA sablona nevyhovuje diete', {
      meal_type: mealType,
      diet_type: rules.dietType,
      pool_size: pool.length,
    });
  }
  // Makrová preference (low_carb) až po tvrdém filtru a jen když něco zbude.
  const preferred = preferByMacros(kept, rules);
  if (preferred.length !== kept.length) {
    console.log('[simple-meal-planner-agent] makrova preference zuzila nabidku', {
      meal_type: mealType,
      diet_type: rules.dietType,
      before: kept.length,
      after: preferred.length,
    });
  }
  return preferred;
}

/** @see mealSlotTypes — jediný zdroj pravdy pro sloty, sdílený s deterministicFallback. */
const mealTypesForCount = mealSlotTypes;

export const MAX_MEAL_USES_PER_WEEK = 2;
const MIN_DISTINCT_BY_TYPE = Object.freeze({
  breakfast: 3,
  lunch: 4,
  dinner: 4,
  snack: 2,
});

/**
 * Efektivní bazální kcal šablony PRO ŠKÁLOVÁNÍ PORCE. Knihovní recept (když
 * existuje) přebíjí `fallback_meal_template.kcal` — je to přesně to číslo,
 * které použije `buildSimpleStartLibraryMeal`/`resolveSimpleStartLocalSlot`
 * při reálném škálování (PR 1). Počítat kalorickou shodu proti fallback kcal
 * by u templátů s knihovním receptem (většina po PR 1) mohlo dát jiný
 * výsledek než to, co se doopravdy naservíruje.
 * @param {object} tpl
 * @param {string} mealType
 * @returns {number|null}
 */
export function templateBaseKcal(tpl, mealType) {
  const lib = findSimpleStartRecipeByTitle(tpl.name_cs, mealType);
  const kcal = Number(lib?.calories ?? tpl.fallback_meal_template?.kcal);
  return Number.isFinite(kcal) && kcal > 0 ? kcal : null;
}

/**
 * Normalizovaný název jídla BEZ velikostní přípony — „Těstoviny s kuřetem"
 * a „Těstoviny s kuřetem, velká porce" mají stejný klíč.
 *
 * PROMPT_PRO_CODE.md bod C. Kalorické filtrování samo o sobě může vybrat
 * stejný základ jídla dvakrát za den v jiné velikosti (oběd „Těstoviny
 * s kuřetem, velká porce", večeře „Těstoviny s kuřetem") — `baseDishKey`
 * dovolí tomu zabránit, aniž by se muselo parsovat/udržovat zvlášť.
 * @param {string} name
 * @returns {string}
 */
export function baseDishKey(name) {
  return String(name || '')
    .replace(/,\s*(extra\s+)?velk[áa]\s+porce\s*$/i, '')
    .trim()
    .toLowerCase();
}

/**
 * PROMPT_PRO_CODE.md bod A+B — kaloricky vědomý výběr šablony.
 *
 * Pro daný `slotTarget` (kcal) rozdělí kandidáty (stejná rotace, stejné
 * `exclusions`/`MAX_MEAL_USES_PER_WEEK` jako dřív) do tří skupin podle
 * potřebného multiplikátoru `slotTarget / templateBaseKcal`:
 *
 *   1. uvnitř [START_MIN_SCALE, START_MAX_SCALE] — sedí přesně, primární.
 *   2. nad START_MAX_SCALE — šablona je na slot MALÁ. Přijatelná záloha:
 *      den skončí pod cílem, což `fillDayCaloriesByAddingLibraryMeals` umí
 *      dorovnat přidaným jídlem — poctivé, ne vymyšlené kalorie.
 *   3. pod START_MIN_SCALE — šablona je na slot VELKÁ. Nikdy nevybírat:
 *      zmenšit pod 0,85 se nesmí, takže by cíl přestřelila (produkční
 *      nález: „Těstoviny s kuřetem, velká porce" 1009 kcal na slot
 *      1600kcal/den dne přestřelilo o +45 %).
 *
 * Uvnitř vybrané skupiny se rotuje STEJNÝM POZIČNÍM VZORCEM jako dřív —
 * NEŘADÍ se podle nejmenší odchylky. Řazení podle nejlepší shody je přesně
 * past z #237 (deterministicky nejbližší kus pořád dokola), kterou #238
 * opravovalo pro záměnu jídla; tady platí stejně.
 *
 * @param {Array<object>} candidates v pozičním pořadí rotace
 * @param {string} mealType
 * @param {number} slotTarget
 * @returns {{ group1: Array<object>, group2: Array<object> }}
 */
function splitByCalorieFit(candidates, mealType, slotTarget) {
  const group1 = [];
  const group2 = [];
  for (const c of candidates) {
    const baseKcal = templateBaseKcal(c, mealType);
    if (baseKcal == null) continue;
    const needed = slotTarget / baseKcal;
    if (needed < START_MIN_SCALE) continue; // skupina 3 — nikdy
    if (needed <= START_MAX_SCALE) group1.push(c);
    else group2.push(c);
  }
  return { group1, group2 };
}

/**
 * @param {Array<object>} pool
 * @param {number} dayIndex
 * @param {number} mi
 * @param {ReturnType<typeof import('../dietaryExclusions.js').parseDietaryExclusions>} exclusions
 * @param {string} mealType
 * @param {Map<string, number>} usedCounts
 * @param {number} [slotTarget] kcal cíl slotu — bez něj se chová jako dřív (kalorii neřeší).
 * @param {Set<string>} [usedDishKeysToday] `baseDishKey` už vybraných jídel TOHOTO dne — bod C.
 */
export function pickTemplateForSlot(pool, dayIndex, mi, exclusions, mealType, usedCounts, slotTarget, usedDishKeysToday) {
  const len = pool.length || 1;

  const buildRotationCandidates = (respectUsageCap) => {
    const out = [];
    for (let offset = 0; offset < len; offset += 1) {
      const tplIdx = (dayIndex * 5 + mi * 3 + offset) % len;
      const mealTpl = pool[tplIdx];
      if (!isTemplateAllowedForExclusions(mealTpl, exclusions)) continue;
      if (respectUsageCap) {
        const uses = usedCounts.get(mealTpl.name_cs) || 0;
        if (uses >= MAX_MEAL_USES_PER_WEEK) continue;
      }
      out.push(mealTpl);
    }
    return out;
  };

  const candidates = buildRotationCandidates(true);

  const take = (list) => {
    if (!list.length) return null;
    const picked = list[0];
    usedCounts.set(picked.name_cs, (usedCounts.get(picked.name_cs) || 0) + 1);
    return picked;
  };

  /** Skupina 1 (sedí) nebo skupina 2 (moc slabá, ale záloha) — rotační pořadí uvnitř skupiny. */
  const tryCalorieGroups = (list) => {
    if (!list.length) return null;
    // Bod C — měkké omezení: nejdřív bez dnešních duplicitních základů
    // jídla, a jen když by to skupiny vyprázdnilo, zkusí se to znovu se
    // všemi kandidáty. Duplikát je pořád lepší plán než `null`.
    const withoutDuplicateDish = usedDishKeysToday
      ? list.filter((c) => !usedDishKeysToday.has(baseDishKey(c.name_cs)))
      : list;
    for (const l of [withoutDuplicateDish, list]) {
      if (!l.length) continue;
      const { group1, group2 } = splitByCalorieFit(l, mealType, slotTarget);
      const picked = take(group1) || take(group2);
      if (picked) return picked;
    }
    return null;
  };

  if (candidates.length && Number.isFinite(slotTarget) && slotTarget > 0) {
    const picked = tryCalorieGroups(candidates);
    if (picked) return picked;

    // PROPADOVÁ VĚTEV (PROMPT_PRO_CODE.md bod A, 2026-09-17). Skupina 1 i 2
    // jsou prázdné i po odfiltrování duplicitního základu jídla — produkční
    // nález: na cíl 252 kcal sedí do pásma jen 3 z 11 standard svačin,
    // `MAX_MEAL_USES_PER_WEEK=2` dá kapacitu 6, ale týden potřebuje 14
    // svačinových slotů; od třetího dne tahle skupina zůstává prázdná a
    // dřív se propadlo rovnou na kalorii neznající rotaci (jídlo za 480 na
    // slot 252). Než na to spadnout, zkusí se DVĚ VĚCI, OBĚ JEN TADY —
    // v degenerované větvi, ne v normální cestě, aby nevznikl dvoucyklus
    // z #237, který #238 opravovalo:
    //   1) postavit kandidáty znovu BEZ `MAX_MEAL_USES_PER_WEEK` (třetí
    //      opakování sedící svačiny je lepší než den o 17 % vedle) a znovu
    //      zkusit stejné kalorické dělení (pořád rotační pořadí uvnitř
    //      skupiny, ne řazení podle shody);
    //   2) když je skupina 1 i 2 pořád prázdná, vzít kandidáta s
    //      NEJMENŠÍMI kaloriemi, ne prvního v rotaci — v týhle situaci jsou
    //      nutně VŠECHNY kandidáty skupina 3 (moc velké na slot), takže
    //      nejmenší kalorie = nejmenší přestřelení po zmenšení na
    //      `START_MIN_SCALE`.
    const candidatesNoUsageCap = buildRotationCandidates(false);
    if (candidatesNoUsageCap.length) {
      const pickedNoCap = tryCalorieGroups(candidatesNoUsageCap);
      if (pickedNoCap) return pickedNoCap;

      const bySmallestKcal = [...candidatesNoUsageCap].sort((a, b) => {
        const ka = templateBaseKcal(a, mealType);
        const kb = templateBaseKcal(b, mealType);
        if (ka == null) return kb == null ? 0 : 1;
        if (kb == null) return -1;
        return ka - kb;
      });
      const smallest = take(bySmallestKcal);
      if (smallest) return smallest;
    }
    // Nic nezbylo ani takhle (nemělo by nastat) — propadá se na dosavadní,
    // kalorii neznající cestu níž.
  }

  if (candidates.length) return take(candidates);

  const altNames = cheeseFreeAlternativeNames(mealType);
  const altName = altNames[dayIndex % altNames.length] || cheeseFreeAlternativeName(mealType);
  const hit = pool.find((item) => item.name_cs === altName && isTemplateAllowedForExclusions(item, exclusions));
  if (hit) {
    usedCounts.set(hit.name_cs, (usedCounts.get(hit.name_cs) || 0) + 1);
    return hit;
  }
  // `pool` už je profiltrovaný dietou (poolForDiet), takže poslední záchrana
  // z něj dietu neporuší. Limit opakování se tady vědomě obchází — dvakrát
  // totéž jídlo je horší plán, porušená dieta je vadný plán.
  const fallback = pool.find((item) => isTemplateAllowedForExclusions(item, exclusions)) || pool[0] || null;
  if (fallback) usedCounts.set(fallback.name_cs, (usedCounts.get(fallback.name_cs) || 0) + 1);
  return fallback;
}

function enforceMinimumDistinctTypes(planDays, templates, usedTypes, exclusions) {
  for (const type of usedTypes) {
    const minDistinct = MIN_DISTINCT_BY_TYPE[type] || 2;
    const pool = templates[type] || [];
    const names = new Set();
    for (const day of planDays) {
      for (const meal of day.meals || []) {
        if (meal.type === type) names.add(meal.name_cs);
      }
    }
    if (names.size >= minDistinct || pool.length < minDistinct) continue;
    const missing = pool.filter(
      (tpl) => !names.has(tpl.name_cs) && isTemplateAllowedForExclusions(tpl, exclusions)
    );
    let mi = 0;
    for (const tpl of missing) {
      if (names.size >= minDistinct) break;
      const day = planDays[mi % planDays.length];
      const slotIdx = day.meals.findIndex((m) => m.type === type);
      if (slotIdx < 0) continue;
      const prev = day.meals[slotIdx].name_cs;
      day.meals[slotIdx] = {
        ...day.meals[slotIdx],
        name_cs: tpl.name_cs,
        allowed_catalog_match_terms: tpl.allowed_catalog_match_terms,
        forbidden_catalog_terms: tpl.forbidden_catalog_terms,
        fallback_meal_template: tpl.fallback_meal_template,
        prep_time_max_minutes: tpl.prep_time_max_minutes,
        max_main_ingredients: tpl.max_main_ingredients,
      };
      names.delete(prev);
      names.add(tpl.name_cs);
      mi += 1;
    }
  }
}

function applyPinnedMealsToSkeleton(planDays, pinnedMeals = [], templates, exclusions, mealsPerDay, baseDaily) {
  if (!Array.isArray(pinnedMeals) || !pinnedMeals.length) return;
  for (const pin of pinnedMeals) {
    const pinType = String(pin.meal_type || '').toLowerCase();
    const pinText = String(pin.meal_text || '').trim();
    if (!pinType || !pinText) continue;
    const pool = templates[pinType] || [];
    const tpl = pool.find((item) => item.name_cs === pinText)
      || pool.find((item) => pinText.toLowerCase().includes(item.name_cs.toLowerCase().slice(0, 8)));
    if (!tpl || !isTemplateAllowedForExclusions(tpl, exclusions)) continue;
    const day = planDays.find((d) => (d.meals || []).some((m) => m.type === pinType));
    if (!day) continue;
    const slotIdx = day.meals.findIndex((m) => m.type === pinType);
    if (slotIdx < 0) continue;
    const weightKey = planMealTypeToWeightKey(pinType);
    day.meals[slotIdx] = {
      type: pinType,
      name_cs: tpl.name_cs,
      target_kcal: slotTargetKcal(baseDaily, mealsPerDay, weightKey),
      simplicity_level: 'very_simple',
      allowed_catalog_match_terms: tpl.allowed_catalog_match_terms,
      forbidden_catalog_terms: tpl.forbidden_catalog_terms,
      fallback_meal_template: tpl.fallback_meal_template,
      prep_time_max_minutes: tpl.prep_time_max_minutes,
      max_main_ingredients: tpl.max_main_ingredients,
      simple_start_mode: true,
      planner_source: 'simple_meal_planner_agent',
      pinned_preference: true,
    };
  }
}

/**
 * @param {object} params
 * @param {object} params.bodyMetrics
 * @param {object} [params.targets]
 * @param {number} [params.days=7]
 * @param {number} [params.mealsPerDay]
 * @returns {{ targets: object, meal_plan: { meals_per_day: number, days: Array } }}
 */
export function buildSimpleStartMealSkeleton({
  bodyMetrics,
  targets,
  days = 7,
  mealsPerDay: mealsPerDayIn,
  pinnedMeals = [],
}) {
  const computedTargets = resolveTargets(bodyMetrics, targets);
  const mealsPerDay = resolveMealsPerDay(bodyMetrics, mealsPerDayIn);
  const daily = Number(computedTargets.calories_per_day) || 2200;
  const dk = dietKey(bodyMetrics);
  const baseTemplates = START_MEAL_TEMPLATES[dk] || START_MEAL_TEMPLATES.standard;
  const usedTypes = mealTypesForCount(mealsPerDay);
  const exclusions = parseDietaryExclusions(bodyMetrics);
  const rules = buildDietaryPublishRules(bodyMetrics);
  const usedCounts = new Map();
  const planDays = [];

  // SLOTY VZNIKAJÍ UŽ S OHLEDEM NA DIETU. Filtruje se balík šablon, ne hotový
  // plán — viz poolForDiet(). `dk` vybírá balík (vegan/vegetarian mají vlastní
  // obsah), tenhle filtr pak řeší gluten_free / lactose_free / low_carb.
  /** @type {Record<string, Array<object>>} */
  const templates = {};
  for (const type of Object.keys(baseTemplates)) {
    templates[type] = poolForDiet(baseTemplates[type], rules, type);
  }

  const emptyTypes = usedTypes.filter((t) => !(templates[t] || []).length);
  if (emptyTypes.length) {
    console.error('[simple-meal-planner-agent] dieta nema pro nektere sloty zadnou sablonu', {
      diet_type: rules.dietType,
      meal_types: emptyTypes,
    });
  }

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const dayDaily = jitteredDailyCalorieTarget(daily, dayIndex, bodyMetrics);
    // Bod C — sleduje se PER DEN, ne přes celý týden: stejný základ jídla
    // (bez velikostní přípony) se má vyhnout jen uvnitř jednoho dne, ne
    // napříč celým plánem (to už hlídá MAX_MEAL_USES_PER_WEEK/rozmanitost).
    const usedDishKeysToday = new Set();
    const meals = usedTypes.map((type, mi) => {
      const pool = (templates[type] || []).length ? templates[type] : (templates.lunch || []);
      const weightKey = planMealTypeToWeightKey(type);
      const target_kcal = slotTargetKcal(dayDaily, mealsPerDay, weightKey);
      const mealTpl = pickTemplateForSlot(pool, dayIndex, mi, exclusions, type, usedCounts, target_kcal, usedDishKeysToday);
      if (!mealTpl) {
        // Padnout tady je lepší než navrhnout slot, o kterém víme, že dietu
        // poruší. Volající (planOrchestrator) to zachytí a plán se nevydá.
        throw new Error(
          `simple_meal_planner_no_template_for_diet: ${rules.dietType} / ${type}`
        );
      }
      usedDishKeysToday.add(baseDishKey(mealTpl.name_cs));

      return {
        type,
        name_cs: mealTpl.name_cs,
        target_kcal,
        simplicity_level: 'very_simple',
        allowed_catalog_match_terms: mealTpl.allowed_catalog_match_terms,
        forbidden_catalog_terms: mealTpl.forbidden_catalog_terms,
        fallback_meal_template: mealTpl.fallback_meal_template,
        prep_time_max_minutes: mealTpl.prep_time_max_minutes,
        max_main_ingredients: mealTpl.max_main_ingredients,
        simple_start_mode: true,
        planner_source: 'simple_meal_planner_agent',
      };
    });

    planDays.push({
      day_index: dayIndex,
      day_name: CZECH_DAYS[dayIndex],
      daily_target_kcal: dayDaily,
      meals,
    });
  }

  enforceMinimumDistinctTypes(planDays, templates, usedTypes, exclusions);
  applyPinnedMealsToSkeleton(planDays, pinnedMeals, templates, exclusions, mealsPerDay, daily);

  // `diet` je SKUTEČNÁ dieta uživatele, `template_pack` jen balík šablon.
  // Dřív se logoval jen balík, takže `diet: 'standard'` u bezlepkového
  // uživatele vypadalo jako fakt o profilu, a ne jako fakt o šablonách.
  console.log('[simple-meal-planner-agent] skeleton built', {
    days: planDays.length,
    meals_per_day: mealsPerDay,
    diet: rules.dietType,
    template_pack: dk,
    templates_per_type: Object.fromEntries(usedTypes.map((t) => [t, (templates[t] || []).length])),
  });

  return {
    targets: computedTargets,
    meal_plan: {
      meals_per_day: mealsPerDay,
      days: planDays,
      planner_source: 'simple_meal_planner_agent',
    },
  };
}

export default buildSimpleStartMealSkeleton;
