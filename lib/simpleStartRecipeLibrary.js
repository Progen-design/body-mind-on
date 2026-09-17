function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mealTypeToEn(value) {
  const t = normalizeText(value);
  if (t === 'snidane' || t === 'breakfast') return 'breakfast';
  if (t === 'obed' || t === 'lunch') return 'lunch';
  if (t === 'vecere' || t === 'dinner') return 'dinner';
  if (t === 'svacina' || t === 'snack') return 'snack';
  return 'lunch';
}

export const SIMPLE_START_RECIPES = [
  {
    key: 'vejce-pecivo-zelenina',
    title: 'Vejce s pečivem a zeleninou',
    meal_type: 'breakfast',
    ingredients: ['vejce 3 ks', 'celozrnné pečivo 2 plátky', 'rajče 1 ks', 'okurka 1/2 ks'],
    instructions: [
      'Uvař vejce natvrdo nebo je připrav míchaná na pánvi.',
      'Nakrájej rajče a okurku na kousky.',
      'Připrav si celozrnné pečivo.',
      'Dej vejce na talíř se zeleninou.',
      'Lehce osol a opepři podle chuti.',
      'Podávej hned jako rychlou snídani.',
    ],
    calories: 450,
    protein_g: 24,
    carbs_g: 38,
    fat_g: 22,
  },
  {
    key: 'ryze-vejce-zelenina',
    title: 'Rýže s vejcem a zeleninou',
    meal_type: 'lunch',
    ingredients: ['rýže 80 g', 'vejce 2 ks', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Zeleninu nakrájej na menší kousky.',
      'Na pánvi rozehřej trochu oleje.',
      'Přidej zeleninu a krátce ji orestuj.',
      'Přidej vejce a míchej, dokud se nesrazí.',
      'Vmíchej rýži, dochuť solí a pepřem a podávej.',
    ],
    calories: 540,
    protein_g: 24,
    carbs_g: 64,
    fat_g: 20,
  },
  {
    key: 'vejce-natvrdo-zelenina',
    title: 'Vejce natvrdo se zeleninou',
    meal_type: 'snack',
    ingredients: ['vejce 2 ks', 'rajče 1 ks', 'okurka 1/2 ks', 'olivový olej 1 lžička'],
    instructions: [
      'Dej vejce do vroucí vody a vař asi 9 minut.',
      'Vejce zchlaď ve studené vodě a oloupej.',
      'Nakrájej rajče a okurku na kousky.',
      'Rozlož vejce a zeleninu na talíř.',
      'Zakápni olejem a lehce osol.',
      'Sněz jako rychlou svačinu.',
    ],
    calories: 260,
    protein_g: 16,
    carbs_g: 8,
    fat_g: 18,
  },
  {
    key: 'tvarohova-miska',
    title: 'Tvarohová miska',
    meal_type: 'dinner',
    ingredients: ['tvaroh 250 g', 'banán 1 ks', 'mandle 15 g'],
    instructions: [
      'Dej tvaroh do misky.',
      'Nakrájej banán na kolečka.',
      'Přidej banán do tvarohu.',
      'Mandle nasekej nebo nech celé.',
      'Posyp mandlemi tvaroh.',
      'Podávej hned, případně dochutí solí nebo skořicí.',
    ],
    calories: 420,
    protein_g: 34,
    carbs_g: 32,
    fat_g: 14,
  },
  {
    key: 'ovesna-kase-protein',
    title: 'Ovesná kaše s proteinem',
    meal_type: 'breakfast',
    ingredients: ['ovesné vločky 60 g', 'mléko 200 ml', 'protein 30 g', 'banán 1 ks'],
    instructions: [
      'Vločky vsyp do hrnce s mlékem.',
      'Za stálého míchání povař do zhoustnutí.',
      'Odstav z plotny a nech chvíli vychladnout.',
      'Vmíchej protein, dokud se nerozpustí.',
      'Nakrájej banán a přidej do kaše.',
      'Podávej teplé hned po dochucení.',
    ],
    calories: 480,
    protein_g: 33,
    carbs_g: 59,
    fat_g: 12,
  },
  {
    key: 'cocka-s-vejcem',
    title: 'Čočka s vejcem',
    meal_type: 'lunch',
    ingredients: ['čočka 80 g', 'vejce 2 ks', 'zelenina 150 g'],
    instructions: [
      'Čočku propláchni a uvař do měkka podle návodu.',
      'Zeleninu nakrájej na menší kousky.',
      'Vejce uvař natvrdo nebo připrav míchaná.',
      'Čočku sceď a dej do mísy nebo na talíř.',
      'Přidej zeleninu a vejce.',
      'Lehce osol, opepři a podávej teplé.',
    ],
    calories: 550,
    protein_g: 32,
    carbs_g: 58,
    fat_g: 16,
  },
  {
    key: 'kefir-pecivo',
    title: 'Kefír a pečivo',
    meal_type: 'snack',
    ingredients: ['kefír 400 ml', 'celozrnné pečivo 2 plátky'],
    instructions: [
      'Kefír nalij do sklenice nebo misky.',
      'Pečivo si připrav na talíř.',
      'Podávej jako rychlou svačinu bez další přípravy.',
      'Pokud chceš, pečivo lehce opeč v toustovači.',
      'Svačinu sněz do hodiny od přípravy.',
    ],
    calories: 320,
    protein_g: 16,
    carbs_g: 40,
    fat_g: 10,
  },
  {
    key: 'cottage-talir',
    title: 'Cottage talíř',
    meal_type: 'snack',
    ingredients: ['cottage 200 g', 'rajče 1 ks', 'okurka 1/2 ks', 'celozrnné pečivo 1 plátek'],
    instructions: [
      'Dej cottage na talíř nebo do misky.',
      'Nakrájej rajče a okurku na kousky.',
      'Zeleninu přidej ke cottage.',
      'Připrav si plátek celozrnného pečiva.',
      'Lehce osol a opepři podle chuti.',
      'Podávej jako studenou svačinu.',
    ],
    calories: 330,
    protein_g: 24,
    carbs_g: 26,
    fat_g: 13,
  },
  {
    key: 'cottage-pecivo',
    title: 'Cottage s pečivem',
    meal_type: 'snack',
    ingredients: ['cottage 180 g', 'celozrnné pečivo 2 plátky', 'okurka 1/2 ks'],
    instructions: [
      'Dej cottage do misky nebo na talíř.',
      'Okurku nakrájej na kolečka nebo kousky.',
      'Přidej zeleninu ke cottage.',
      'Připrav si celozrnné pečivo.',
      'Lehce osol a opepři podle chuti.',
      'Sněz jako rychlé studené jídlo bez další přípravy.',
    ],
    calories: 340,
    protein_g: 23,
    carbs_g: 32,
    fat_g: 12,
  },
  {
    key: 'fazole-ryze',
    title: 'Fazole s rýží',
    meal_type: 'lunch',
    ingredients: ['fazole 200 g', 'rýže 80 g', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Fazole ohřej na pánvi nebo v hrnci.',
      'Zeleninu nakrájej a krátce orestuj na oleji.',
      'Smíchej rýži s fazolemi a zeleninou.',
      'Dochuť solí a pepřem.',
      'Podávej teplé hned po dochucení.',
    ],
    calories: 590,
    protein_g: 22,
    carbs_g: 86,
    fat_g: 16,
  },
  {
    key: 'testoviny-kure',
    title: 'Těstoviny s kuřetem',
    meal_type: 'lunch',
    ingredients: ['těstoviny 80 g', 'kuřecí prsa 150 g', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Uvař těstoviny podle návodu na obalu.',
      'Kuřecí prsa nakrájej na menší kousky.',
      'Osol, opepři a opeč na pánvi s trochou oleje.',
      'Přidej zeleninu a krátce prohřej.',
      'Smíchej s uvařenými těstovinami.',
      'Podávej teplé; případně si část nech do krabičky.',
    ],
    calories: 640,
    protein_g: 43,
    carbs_g: 68,
    fat_g: 18,
  },
  {
    key: 'jogurt-ovoce',
    title: 'Jogurt s ovocem',
    meal_type: 'snack',
    ingredients: ['jogurt 180 g', 'banán 1 ks', 'jahody 80 g'],
    instructions: [
      'Dej jogurt do misky.',
      'Banán nakrájej na kolečka.',
      'Jahody omyj a nakrájej.',
      'Ovoce přidej do jogurtu.',
      'Lehce promíchej.',
      'Podávej hned jako rychlou svačinu.',
    ],
    calories: 220,
    protein_g: 14,
    carbs_g: 28,
    fat_g: 6,
  },
  {
    key: 'kure-ryze-zelenina',
    title: 'Kuře s rýží a zeleninou',
    meal_type: 'lunch',
    ingredients: ['kuřecí prsa 150 g', 'rýže 80 g', 'zelenina 150 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Kuřecí prsa nakrájej na kousky.',
      'Osol, opepři a opeč na pánvi s olejem.',
      'Přidej zeleninu a krátce prohřej.',
      'Podávej s hotovou rýží na talíři.',
      'Dochuť solí a pepřem podle chuti.',
    ],
    calories: 620,
    protein_g: 42,
    carbs_g: 65,
    fat_g: 16,
  },
  {
    key: 'testoviny-tunak',
    title: 'Těstoviny s tuňákem',
    meal_type: 'lunch',
    ingredients: ['těstoviny 80 g', 'tuňák ve vlastní šťávě 1 konzerva', 'zelenina 150 g'],
    instructions: [
      'Uvař těstoviny podle návodu na obalu.',
      'Tuňáka sceď a rozmělní vidličkou.',
      'Zeleninu nakrájej na menší kousky.',
      'Smíchej těstoviny s tuňákem a zeleninou.',
      'Lehce osol a opepři.',
      'Podávej hned, ideálně teplé.',
    ],
    calories: 600,
    protein_g: 38,
    carbs_g: 68,
    fat_g: 14,
  },
  {
    key: 'brambory-vejce',
    title: 'Brambory s vejcem',
    meal_type: 'dinner',
    ingredients: ['brambory 300 g', 'vejce 2 ks', 'zelenina 100 g'],
    instructions: [
      'Brambory oloupej, nakrájej a uvař do měkka.',
      'Vejce uvař natvrdo nebo připrav míchaná.',
      'Zeleninu nakrájej na kousky.',
      'Brambory sceď a dej na talíř.',
      'Přidej vejce a zeleninu.',
      'Lehce osol, opepři a podávej teplé.',
    ],
    calories: 500,
    protein_g: 20,
    carbs_g: 52,
    fat_g: 22,
  },
  {
    key: 'omeleta-zelenina',
    title: 'Omeleta se zeleninou',
    meal_type: 'dinner',
    ingredients: ['vejce 3 ks', 'zelenina 200 g', 'olivový olej 1 lžíce'],
    instructions: [
      'Vejce rozšlehej v misce se špetkou soli.',
      'Zeleninu nakrájej na menší kousky.',
      'Na pánvi rozehřej olej a orestuj zeleninu.',
      'Zalij vejci a nech ztuhnout zespodu.',
      'Opatrně otoč nebo dopeč pod pokličkou.',
      'Podávej teplou omeletu hned z pánve.',
    ],
    calories: 480,
    protein_g: 32,
    carbs_g: 18,
    fat_g: 28,
  },
  {
    key: 'tunak-salat-pecivo',
    title: 'Tuňákový salát s pečivem',
    meal_type: 'dinner',
    ingredients: ['tuňák ve vlastní šťávě 1 konzerva', 'zelenina 150 g', 'celozrnné pečivo 2 plátky'],
    instructions: [
      'Tuňáka sceď a dej do misky.',
      'Zeleninu nakrájej na kousky.',
      'Smíchej tuňáka se zeleninou.',
      'Lehce osol a opepři podle chuti.',
      'Připrav si celozrnné pečivo.',
      'Podávej jako rychlou večeři hned po smíchání.',
    ],
    calories: 520,
    protein_g: 36,
    carbs_g: 42,
    fat_g: 18,
  },
  {
    key: 'sunka-pecivo-zelenina',
    title: 'Šunka, pečivo a zelenina',
    meal_type: 'breakfast',
    ingredients: ['šunka 60 g', 'celozrnné pečivo 2 plátky', 'zelenina 100 g'],
    instructions: [
      'Připrav si plátky celozrnného pečiva.',
      'Na pečivo dej šunku.',
      'Zeleninu nakrájej na kousky.',
      'Podávej sendvič se zeleninou navíc.',
      'Lehce dochutí solí a pepřem, pokud chceš.',
      'Sněz hned jako rychlou snídani.',
    ],
    calories: 400,
    protein_g: 22,
    carbs_g: 32,
    fat_g: 21,
  },
  {
    key: 'sunka-syr-pecivo',
    title: 'Šunka, sýr, pečivo a zelenina',
    meal_type: 'breakfast',
    ingredients: ['šunka 60 g', 'sýr 2 plátky', 'celozrnné pečivo 2 plátky', 'zelenina 100 g'],
    instructions: [
      'Připrav si plátky celozrnného pečiva.',
      'Na pečivo dej šunku a sýr.',
      'Zeleninu nakrájej na kousky.',
      'Podávej sendvič se zeleninou navíc.',
      'Lehce dochutí solí a pepřem, pokud chceš.',
      'Sněz hned jako rychlou snídani.',
    ],
    calories: 420,
    protein_g: 22,
    carbs_g: 35,
    fat_g: 18,
  },
  // Dense fill snacks — high kcal + flexible staples (for high TDEE without 8 meals/day)
  {
    key: 'protein-napoj-banan',
    title: 'Proteinový nápoj a banán',
    meal_type: 'snack',
    ingredients: ['proteinový prášek 40 g', 'mléko 300 ml', 'banán 1 ks'],
    instructions: [
      'Do shakeru dej proteinový prášek.',
      'Zalij mlékem a důkladně protřepej.',
      'Banán sněz jako přílohu, nebo rozmixuj do nápoje.',
      'Vypij hned jako svačinu.',
      'Ideální po tréninku nebo mezi jídly.',
      'Nepřidávej cukr — sladkost dodá banán.',
    ],
    calories: 420,
    protein_g: 38,
    carbs_g: 42,
    fat_g: 8,
  },
  {
    key: 'oves-tvaroh-dense',
    title: 'Ovesné vločky s tvarohem',
    meal_type: 'snack',
    ingredients: ['ovesné vločky 80 g', 'tvaroh 200 g', 'med 15 g'],
    instructions: [
      'Ovesné vločky zalij horkou vodou nebo mlékem a nech nabobtnat.',
      'Přidej tvaroh a promíchej.',
      'Dochuť medem.',
      'Podávej v misce jako sytou svačinu.',
      'Můžeš sníst studené i vlažné.',
      'Připrav za 5 minut bez vaření na sporáku.',
    ],
    calories: 480,
    protein_g: 32,
    carbs_g: 62,
    fat_g: 10,
  },
  {
    key: 'ryze-tunak-svacina',
    title: 'Rýže s tuňákem',
    meal_type: 'snack',
    ingredients: ['rýže 70 g', 'tuňák ve vlastní šťávě 1 konzerva', 'olivový olej 10 ml'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Tuňáka sceď a rozmělni vidličkou.',
      'Smíchej s rýží a olejem.',
      'Lehce osol a opepři.',
      'Podávej teplé nebo do krabičky.',
      'Jednoduchá sytá svačina na cesty.',
    ],
    calories: 450,
    protein_g: 32,
    carbs_g: 52,
    fat_g: 10,
  },
  {
    key: 'cottage-orechy-pecivo',
    title: 'Cottage s ořechy a pečivem',
    meal_type: 'snack',
    ingredients: ['cottage 200 g', 'ořechy 30 g', 'celozrnné pečivo 2 plátky'],
    instructions: [
      'Cottage dej do misky.',
      'Přidej ořechy.',
      'Podávej s pečivem.',
      'Můžeš dochutit špetkou soli nebo bylinkami.',
      'Sněz hned jako sytou svačinu.',
      'Bez vaření — připraveno za minutu.',
    ],
    calories: 460,
    protein_g: 30,
    carbs_g: 32,
    fat_g: 24,
  },
  {
    key: 'chleba-arasid-banan',
    title: 'Chleba s arašídovým máslem a banánem',
    meal_type: 'snack',
    ingredients: ['celozrnné pečivo 2 plátky', 'arašídové máslo 30 g', 'banán 1 ks'],
    instructions: [
      'Na pečivo namaž arašídové máslo.',
      'Banán nakrájej na kolečka a polož na pečivo.',
      'Podávej hned.',
      'Sladké i syté zároveň.',
      'Ideální rychlá svačina před tréninkem.',
      'Bez vaření.',
    ],
    calories: 470,
    protein_g: 16,
    carbs_g: 48,
    fat_g: 24,
  },
  // PROMPT_PRO_CODE.md PR 1 (2026-09-17) — 11 šablon z START_MEAL_TEMPLATES
  // bez knihovního receptu, 6 z nich veganských. U veganských typů to
  // znamenalo 0 kandidátů s `requireLibraryRecipe` (pickSimpleStartMealAlternative)
  // v KAŽDÉM ze čtyř typů jídla — záměna jídla u vegan diety nefungovala vůbec.
  // Makra jsou dopočtená ze surovin (ne odhadnutá), viz PR popis pro tabulku
  // surovina -> gramáž -> kcal/B/S/T u každého receptu. Gramáž je upravená
  // oproti `fallback_meal_template.shopping_ingredient_lines` tak, aby se
  // dopočet trefil do ~10 % cíle šablony — číslo v šabloně byl odhad, ne
  // spočtená hodnota.
  {
    key: 'tvaroh-vlocky-banan',
    title: 'Tvaroh s vločkami a banánem',
    meal_type: 'breakfast',
    ingredients: ['tvaroh 190 g', 'ovesné vločky 30 g', 'banán 1 ks'],
    instructions: [
      'Ovesné vločky zalij lžící vody nebo mléka a nech 5 minut změknout.',
      'Tvaroh dej do misky a rozmíchej vidličkou dohladka.',
      'Vmíchej do tvarohu nabobtnalé vločky.',
      'Banán nakrájej na kolečka.',
      'Banán přidej na vrch nebo vmíchej do směsi.',
      'Podávej hned, bez vaření.',
    ],
    calories: 405,
    protein_g: 27,
    carbs_g: 52,
    fat_g: 11,
  },
  {
    key: 'tvaroh-ovoce',
    title: 'Tvaroh s ovocem',
    meal_type: 'snack',
    ingredients: ['tvaroh 165 g', 'banán 80 g'],
    instructions: [
      'Tvaroh dej do misky.',
      'Banán nakrájej na kolečka nebo kostičky.',
      'Banán vmíchej do tvarohu nebo ho nech navrchu.',
      'Lehce promíchej.',
      'Podávej hned jako rychlou svačinu bez vaření.',
    ],
    calories: 233,
    protein_g: 20,
    carbs_g: 24,
    fat_g: 8,
  },
  {
    key: 'kureci-tortilla-jednoducha',
    title: 'Kuřecí tortilla jednoduchá',
    meal_type: 'lunch',
    ingredients: ['kuřecí prsa 100 g', 'tortilla 2 ks', 'zelenina 150 g', 'olivový olej 2 čajové lžičky (7 g)'],
    instructions: [
      'Kuřecí prsa nakrájej na proužky, osol a opepři.',
      'Opeč na pánvi s olejem doměkka.',
      'Zeleninu nakrájej na tenké proužky.',
      'Tortilly krátce prohřej na suché pánvi nebo v troubě.',
      'Rozlož na tortilly kuře a zeleninu a zaviň do rolky.',
      'Podávej hned.',
    ],
    calories: 572,
    protein_g: 41,
    carbs_g: 59,
    fat_g: 18,
  },
  {
    key: 'kure-se-zeleninou',
    title: 'Kuře se zeleninou',
    meal_type: 'dinner',
    ingredients: ['kuřecí prsa 130 g', 'zelenina 300 g', 'olivový olej 2 lžíce (20 g)'],
    instructions: [
      'Kuřecí prsa nakrájej na kousky, osol a opepři.',
      'Orestuj na pánvi s částí oleje.',
      'Zeleninu nakrájej na kousky.',
      'Přidej zeleninu ke kuřeti a zbytek oleje.',
      'Restuj dohromady, dokud zelenina nezměkne.',
      'Podávej teplé.',
    ],
    calories: 481,
    protein_g: 45,
    carbs_g: 18,
    fat_g: 25,
  },
  {
    key: 'ovesna-kase-ovoce',
    title: 'Ovesná kaše s ovocem',
    meal_type: 'breakfast',
    // Mandlové mléko (ne obecné "rostlinné mléko") schválně — konkrétní
    // rostlinné mléko je v NOT_WHAT_IT_LOOKS_LIKE (lib/dietCriticalTerms.js),
    // obecné "mléko" by bránu vegan diety trefilo jako živočišný produkt.
    ingredients: ['ovesné vločky 60 g', 'mandlové mléko (neslazené) 200 ml', 'banán 1 ks', 'mandle 8 g'],
    instructions: [
      'Vločky vsyp do hrnce s mandlovým mlékem.',
      'Za stálého míchání přiveď k varu a povař do zhoustnutí.',
      'Odstav z plotny a nech chvíli zchladnout.',
      'Banán nakrájej na kolečka.',
      'Kaši posyp banánem a mandlemi.',
      'Podávej teplé.',
    ],
    calories: 402,
    protein_g: 12,
    carbs_g: 66,
    fat_g: 11,
  },
  {
    key: 'ovoce-orechy',
    title: 'Ovoce a ořechy',
    meal_type: 'snack',
    // Arašídy místo šablonových mandlí — poměr bílkovin k tuku sedí k cíli
    // (B8/T12) o dost líp, mandle samotné by na 8 g bílkovin potřebovaly
    // tolik tuku, že by recept přestřelil kalorie i tuk o desítky procent.
    ingredients: ['banán 1 ks (100 g)', 'arašídy 25 g (nesolené)'],
    instructions: [
      'Banán oloupej.',
      'Arašídy si odměř do misky.',
      'Banán sněz spolu s arašídy, nebo ho nakrájej na kolečka a arašídy posyp navrch.',
      'Bez přípravy, hotovo za minutu.',
    ],
    // 4*8 + 4*27 + 9*12 = 248 — `calories` musí sedět na makra, jinak si
    // odporují dvě čísla u jednoho receptu. Dřív tu bylo 231/T13, což z maker
    // dávalo 257 kcal (+11 %). Cíl šablony je 250 kcal, takže 248 sedí líp.
    calories: 248,
    protein_g: 8,
    carbs_g: 27,
    fat_g: 12,
  },
  {
    key: 'hummus-pecivo',
    title: 'Hummus a pečivo',
    meal_type: 'snack',
    ingredients: ['hummus 60 g', 'celozrnné pečivo 2 plátky (55 g)', 'olivový olej 1 čajová lžička (5 g)'],
    instructions: [
      'Hummus dej do misky a zakápni olejem.',
      'Připrav si plátky celozrnného pečiva.',
      'Pečivo namáčej do hummusu nebo ho na něj rozetři.',
      'Podávej jako rychlou svačinu bez vaření.',
    ],
    calories: 281,
    protein_g: 10,
    carbs_g: 33,
    fat_g: 13,
  },
  {
    key: 'cocka-zelenina',
    title: 'Čočka se zeleninou',
    meal_type: 'lunch',
    ingredients: ['čočka 95 g', 'zelenina 250 g', 'olivový olej necelá lžíce (8 g)'],
    instructions: [
      'Čočku propláchni a uvař do měkka podle návodu na obalu.',
      'Zeleninu nakrájej na kousky.',
      'Na pánvi rozehřej olej a zeleninu orestuj.',
      'Přidej uvařenou čočku a promíchej.',
      'Lehce osol a opepři.',
      'Podávej teplé.',
    ],
    calories: 481,
    protein_g: 28,
    carbs_g: 72,
    fat_g: 10,
  },
  {
    key: 'testoviny-zelenina',
    title: 'Těstoviny se zeleninou',
    meal_type: 'lunch',
    ingredients: ['těstoviny 100 g', 'zelenina 220 g', 'olivový olej 1 lžíce (12 g)'],
    instructions: [
      'Uvař těstoviny podle návodu na obalu.',
      'Zeleninu nakrájej na kousky.',
      'Na pánvi rozehřej olej a zeleninu orestuj doměkka.',
      'Smíchej se scezenými těstovinami.',
      'Lehce osol a opepři.',
      'Podávej teplé.',
    ],
    calories: 525,
    protein_g: 16,
    carbs_g: 84,
    fat_g: 14,
  },
  {
    key: 'brambory-zelenina',
    title: 'Brambory se zeleninou',
    meal_type: 'dinner',
    ingredients: ['brambory 280 g', 'zelenina 250 g', 'olivový olej 2 lžíce (23 g)'],
    instructions: [
      'Brambory oloupej, nakrájej na kostky a uvař doměkka.',
      'Zeleninu nakrájej na kousky.',
      'Na pánvi rozehřej olej a zeleninu orestuj.',
      'Přidej scezené brambory a krátce prohřej dohromady.',
      'Lehce osol a opepři.',
      'Podávej teplé.',
    ],
    calories: 494,
    protein_g: 9,
    carbs_g: 63,
    fat_g: 24,
  },
  {
    key: 'ryze-fazole',
    title: 'Rýže s fazolemi',
    meal_type: 'dinner',
    ingredients: ['rýže 55 g', 'fazole 180 g scezené (cca 3/4 konzervy)', 'zelenina 100 g', 'olivový olej 1 lžíce (9 g)'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Fazole propláchni a scedi.',
      'Zeleninu nakrájej na kousky.',
      'Na pánvi rozehřej olej, přidej zeleninu a krátce orestuj.',
      'Přidej fazole a uvařenou rýži, promíchej.',
      'Lehce osol, opepři a podávej teplé.',
    ],
    calories: 539,
    protein_g: 21,
    carbs_g: 86,
    fat_g: 10,
  },
  // PROMPT_PRO_CODE.md PR 2 (2026-09-17) — vysokokalorické varianty pro
  // breakfast/lunch/dinner (standard). Recept přidán ZÁROVEŇ se šablonou
  // v START_MEAL_TEMPLATES, aby nevznikla stejná díra jako v PR 1 (šablona
  // bez knihovního receptu). `calories` je vždy 4*protein_g + 4*carbs_g +
  // 9*fat_g z ZAOKROUHLENÝCH gramů níž — to je kontrola, kterou PR 1 minula
  // u "Ovoce a ořechy" (231 vs. správných 257/248) a Honza opravoval ručně.
  {
    key: 'ovesna-kase-protein-velka-porce',
    title: 'Ovesná kaše s proteinem, velká porce',
    meal_type: 'breakfast',
    ingredients: ['ovesné vločky 70 g', 'mléko 200 ml', 'proteinový prášek 30 g', 'banán 1 ks'],
    instructions: [
      'Vločky vsyp do hrnce s mlékem.',
      'Za stálého míchání povař do zhoustnutí.',
      'Odstav z plotny a nech chvíli vychladnout.',
      'Vmíchej protein, dokud se nerozpustí.',
      'Nakrájej banán a přidej do kaše.',
      'Vydatná porce — podávej teplé hned po dochucení.',
    ],
    calories: 578,
    protein_g: 40,
    carbs_g: 82,
    fat_g: 10,
  },
  {
    key: 'vejce-sunka-pecivo-velka-porce',
    title: 'Vejce se šunkou a pečivem, velká porce',
    meal_type: 'breakfast',
    ingredients: ['vejce 4 ks', 'šunka 100 g', 'celozrné pečivo 3 plátky', 'zelenina 100 g'],
    instructions: [
      'Vejce rozšlehej a připrav míchaná na pánvi se špetkou soli.',
      'Šunku nakrájej na kousky.',
      'Zeleninu nakrájej na kousky.',
      'Rozlož vejce, šunku a zeleninu na talíř s pečivem.',
      'Vydatná porce — podávej hned jako sytou snídani.',
    ],
    calories: 668,
    protein_g: 54,
    carbs_g: 50,
    fat_g: 28,
  },
  {
    key: 'kure-ryze-zelenina-velka-porce',
    title: 'Kuře s rýží a zeleninou, velká porce',
    meal_type: 'lunch',
    ingredients: ['kuřecí prsa 200 g', 'rýže 90 g', 'zelenina 150 g', 'olivový olej 15 g'],
    instructions: [
      'Uvař rýži podle návodu na obalu.',
      'Kuřecí prsa nakrájej na kousky, osol a opepři.',
      'Opeč na pánvi s olejem.',
      'Přidej zeleninu a krátce prohřej.',
      'Podávej s hotovou rýží na talíři.',
      'Vydatná porce — klidně si polovinu nech do krabičky.',
    ],
    calories: 815,
    protein_g: 71,
    carbs_g: 81,
    fat_g: 23,
  },
  {
    key: 'testoviny-kure-velka-porce',
    title: 'Těstoviny s kuřetem, velká porce',
    meal_type: 'lunch',
    ingredients: ['těstoviny 140 g', 'kuřecí prsa 220 g', 'zelenina 150 g', 'olivový olej 15 g'],
    instructions: [
      'Uvař těstoviny podle návodu na obalu.',
      'Kuřecí prsa nakrájej na menší kousky, osol a opepři.',
      'Opeč na pánvi s olejem.',
      'Přidej zeleninu a krátce prohřej.',
      'Smíchej s uvařenými těstovinami.',
      'Vydatná porce — podávej teplé, případně si část nech do krabičky.',
    ],
    calories: 1009,
    protein_g: 88,
    carbs_g: 108,
    fat_g: 25,
  },
  {
    key: 'kure-zelenina-velka-porce',
    title: 'Kuře se zeleninou, velká porce',
    meal_type: 'dinner',
    ingredients: ['kuřecí prsa 220 g', 'zelenina 300 g', 'olivový olej 20 g'],
    instructions: [
      'Kuřecí prsa nakrájej na kousky, osol a opepři.',
      'Orestuj na pánvi s částí oleje.',
      'Zeleninu nakrájej na kousky.',
      'Přidej zeleninu ke kuřeti a zbytek oleje.',
      'Restuj dohromady, dokud zelenina nezměkne.',
      'Vydatná porce — podávej teplé.',
    ],
    calories: 625,
    protein_g: 73,
    carbs_g: 18,
    fat_g: 29,
  },
  {
    key: 'kureci-steak-brambor-zelenina-velka-porce',
    title: 'Kuřecí steak s bramborem a zeleninou, velká porce',
    meal_type: 'dinner',
    ingredients: ['kuřecí prsa 200 g', 'brambory 330 g', 'zelenina 150 g', 'olivový olej 15 g'],
    instructions: [
      'Brambory oloupej, nakrájej na kostky a uvař doměkka.',
      'Kuřecí prsa osol, opepři a opeč na pánvi s olejem.',
      'Zeleninu nakrájej na kousky a krátce orestuj.',
      'Brambory sceď a přidej k zelenině.',
      'Podávej kuřecí steak s bramborem a zeleninou na talíři.',
      'Vydatná porce na vysokokalorický den.',
    ],
    calories: 751,
    protein_g: 71,
    carbs_g: 65,
    fat_g: 23,
  },
];

const SIMPLE_START_INDEX = new Map(
  SIMPLE_START_RECIPES.map((recipe) => [
    `${mealTypeToEn(recipe.meal_type)}::${normalizeText(recipe.title)}`,
    recipe,
  ])
);

const SIMPLE_START_TITLE_INDEX = new Map(
  SIMPLE_START_RECIPES.map((recipe) => [normalizeText(recipe.title), recipe])
);

/** Agent / katalog aliasy → kanonický název v knihovně. */
const SIMPLE_START_TITLE_ALIASES = new Map([
  [normalizeText('Řecký jogurt s ovocem'), 'Jogurt s ovocem'],
  [normalizeText('Krůtí maso s rýží'), 'Kuře s rýží a zeleninou'],
  [normalizeText('Krůtí prsa s rýží'), 'Kuře s rýží a zeleninou'],
  [normalizeText('Krůtí maso s bramborem'), 'Kuře s rýží a zeleninou'],
  [normalizeText('Krůtí maso'), 'Kuře s rýží a zeleninou'],
  [normalizeText('Rýže s vejcem'), 'Rýže s vejcem a zeleninou'],
  [normalizeText('Cottage talíř'), 'Cottage s pečivem'],
  [normalizeText('Sendvič se šunkou'), 'Šunka, pečivo a zelenina'],
]);

export function resolveSimpleStartTitle(title) {
  const raw = String(title || '').trim();
  const norm = normalizeText(raw);
  if (!norm) return raw;
  return SIMPLE_START_TITLE_ALIASES.get(norm) || raw;
}

export function findSimpleStartRecipeByTitle(title, mealType = null) {
  const resolvedTitle = resolveSimpleStartTitle(title);
  const normTitle = normalizeText(resolvedTitle);
  if (!normTitle) return null;
  if (mealType) {
    const exact = SIMPLE_START_INDEX.get(`${mealTypeToEn(mealType)}::${normTitle}`);
    if (exact) return exact;
  }
  return SIMPLE_START_TITLE_INDEX.get(normTitle) || null;
}

export function hasSimpleStartRecipeTitle(title, mealType = null) {
  return !!findSimpleStartRecipeByTitle(title, mealType);
}

/**
 * Identita jídla napříč zdroji (katalogový řádek, knihovní recept, snapshot,
 * nouzová šablona) — pro porovnání „je tohle to samé jídlo?".
 *
 * PROČ TOHLE EXISTUJE. Produkční nález (docs/DALSI_KROK.md, oprava PR #233):
 * `buildStartSafeFallbackMeal()` (lib/startSimpleMealFilter.js) vybírala
 * náhradu jen podle typu jídla a kalorického cíle, bez ohledu na to, co se
 * právě nahrazuje. U snídaně s cílem 440 kcal vybrala snapshot #308
 * "Vejce s pečivem a zeleninou" — TOTOŽNÉ jídlo, které se mělo nahradit.
 * `catalog_id`/`recipe_id` samo o sobě nestačí: knihovní/fallback jídlo ho
 * často nemá (`null`), takže dvě různá "stejná" jídla by prošla jako různá.
 * Samotný název taky nestačí: `buildStartSafeFallbackMeal()` snapshotová
 * větev PŘEPISUJE `name_cs` na název snapshotu bez ohledu na to, co se
 * nahrazovalo — u katalogového jídla je tedy název jediný spolehlivý signál,
 * u knihovního/snapshotového `id` přesnější. Bere se proto silnější dostupný
 * signál: ID, pokud ho mají OBĚ strany, jinak normalizovaný název (přes
 * `resolveSimpleStartTitle`, ať "Krůtí maso s bramborem" pozná jako totéž
 * co jeho alias "Kuře s rýží a zeleninou").
 */
export function simpleStartMealIdentity(meal) {
  const rawId = meal?.catalog_id ?? meal?.recipe_id ?? meal?.id ?? null;
  const title = resolveSimpleStartTitle(
    meal?.display_name_cs || meal?.name_cs || meal?.title || ''
  ).trim().toLowerCase();
  return {
    id: rawId != null && rawId !== '' ? String(rawId) : null,
    title,
  };
}

export function isSameSimpleStartMeal(a, b) {
  const ia = simpleStartMealIdentity(a);
  const ib = simpleStartMealIdentity(b);
  if (ia.id != null && ib.id != null) return ia.id === ib.id;
  return Boolean(ia.title) && ia.title === ib.title;
}

export function buildSimpleStartLibraryMeal(title, mealType, options = {}) {
  const sourceTitle = String(title || '').trim();
  const resolvedTitle = resolveSimpleStartTitle(sourceTitle);
  const recipe = findSimpleStartRecipeByTitle(resolvedTitle, mealType);
  if (!recipe) return null;
  const displayName = recipe.title;
  const safeImageUrl = typeof options.image_url === 'string' && options.image_url.trim()
    ? options.image_url.trim()
    : null;
  return {
    type: mealTypeToEn(mealType || recipe.meal_type),
    name_cs: displayName,
    ai_name: null,
    display_name_cs: displayName,
    display_name: displayName,
    planner_suggestion_cs:
      sourceTitle && sourceTitle !== recipe.title ? sourceTitle : null,
    recipe_verified: true,
    kcal: recipe.calories,
    protein_g: recipe.protein_g,
    carbs_g: recipe.carbs_g,
    fat_g: recipe.fat_g,
    recipe_id: null,
    catalog_id: null,
    catalog_source: 'simple_start_library',
    spoonacular_id: null,
    spoonacular_url: null,
    external_url: null,
    source_url: null,
    shopping_ingredient_lines: [...recipe.ingredients],
    simple_instructions_cs: [...recipe.instructions],
    image_url: safeImageUrl,
    image_trust_level: safeImageUrl ? 'illustrative' : 'none',
    recipe: {
      id: null,
      title: displayName,
      title_cs: displayName,
      image: safeImageUrl,
      source_url: null,
      sourceUrl: null,
      ready_in_minutes: 15,
      calories: recipe.calories,
      protein_g: recipe.protein_g,
      carbs_g: recipe.carbs_g,
      fat_g: recipe.fat_g,
      source: 'simple_start_library',
      portion_multiplier: 1,
      ingredients: [...recipe.ingredients],
      // `instructions` zustava retezec (tuhle podobu ma sloupec v katalogu),
      // ale `instructions_cs` MUSI byt pole: tak ho zapisuje generator planu
      // (lib/profile/postupyDoPlanu.js, `jidlo.recipe.instructions_cs = postup.kroky`)
      // a tak ho cte klient. Do 15. 9. 2026 tady bylo `.join('\n')` a kazde
      // jidlo zamenene pres „Dat si neco jineho" prislo v modalu o postup
      // pripravy — `pouzitelneKroky()` nad retezcem vracela prazdno. Ta uz
      // retezec snese, ale data maji mit jednu podobu, at se to nemusi resit
      // na obou stranach.
      instructions: recipe.instructions.join('\n'),
      instructions_cs: [...recipe.instructions],
    },
    planner_source: options.planner_source || null,
  };
}
