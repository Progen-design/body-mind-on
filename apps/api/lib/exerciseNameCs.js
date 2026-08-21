/**
 * Český název cviku z anglického — slovníkem, ne modelem.
 *
 * PROČ NE MODEL. Názvy cviků vidí uživatel v plánu. Kdyby je překládal model,
 * dostaneme u osmi set cviků osm set různých stylů („Bench press s činkou“,
 * „Tlaky na lavičce“, „Benchpress“) a u části z nich tichý nesmysl, který
 * nikdo nezkontroluje — automat běží denně a bez člověka. Slovník je nudný,
 * ale je vidět v gitu a chová se pokaždé stejně.
 *
 * JAK TO FUNGUJE. Posilovnická angličtina je uzavřený slovník: v 531 cvicích
 * ze zdrojového datasetu je jen 336 různých slov a 150 nejčastějších pokryje
 * dvě třetiny názvů. Věta se skládá ze čtyř míst, vždy ve stejném pořadí:
 *
 *   JÁDRO        pohyb            bench press   → Tlak na lavici
 *   POLOHA       jak se stojí     seated        → vsedě
 *   VYBAVENÍ     čím              dumbbell      → s jednoručkami
 *   VARIANTA     zúžení           close grip    → úzkým úchopem
 *
 *   „Seated Dumbbell Shoulder Press“ → „Tlak nad hlavu vsedě s jednoručkami“
 *
 * BRÁNA. Nepřeložené slovo znamená, že cvik NEPROJDE — do katalogu se nedostane
 * vůbec, místo aby se uživateli ukázal anglicky nebo polovičatě. Slovník se pak
 * doplní a cvik projde příště. Tohle je celý mechanismus kontroly kvality:
 * neznámé slovo je vždycky lepší zahodit než uhodnout.
 */

/** Slova bez vlastního významu — smí zbýt, ale sama o sobě název netvoří. */
const VYPLN = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'with', 'to', 'on', 'in', 'for']);

/**
 * JÁDRA — pohyb. Delší fráze má přednost před kratší, takže „incline bench
 * press“ se nikdy nerozpadne na „bench press“ + volné „incline“.
 */
const JADRA = {
  'incline bench press': 'Tlak na šikmé lavici',
  'decline bench press': 'Tlak na záporné lavici',
  'bench press': 'Tlak na lavici',
  'chest press': 'Tlak na hrudník',
  'shoulder press': 'Tlak nad hlavu',
  'military press': 'Tlak nad hlavu',
  'overhead press': 'Tlak nad hlavu',
  'push press': 'Tlak nad hlavu s výrazem',
  'leg press': 'Leg press',
  'calf press': 'Výpony na stroji',
  'floor press': 'Tlak na zemi',
  'chest fly': 'Rozpažování',
  press: 'Tlak',

  'lateral raise': 'Upažování',
  'side lateral raise': 'Upažování',
  'front raise': 'Předpažování',
  'rear delt raise': 'Rozpažování v předklonu',
  'calf raise': 'Výpony',
  'leg raise': 'Zvedání nohou',
  'knee raise': 'Přitahování kolen',
  'hip raise': 'Zvedání pánve',
  'shoulder shrug': 'Krčení ramen',
  shrug: 'Krčení ramen',

  'preacher curl': 'Bicepsový zdvih na modlitebníku',
  'hammer curl': 'Kladivový zdvih',
  'hammer curls': 'Kladivový zdvih',
  'concentration curl': 'Koncentrovaný zdvih',
  'wrist curl': 'Zdvih zápěstí',
  'leg curl': 'Zakopávání',
  'bicep curl': 'Bicepsový zdvih',
  'biceps curl': 'Bicepsový zdvih',
  curl: 'Bicepsový zdvih',
  curls: 'Bicepsový zdvih',

  'triceps extension': 'Tricepsová extenze',
  'tricep extension': 'Tricepsová extenze',
  'leg extension': 'Předkopávání',
  'back extension': 'Hyperextenze',
  extension: 'Extenze',
  pushdown: 'Stahování kladky',
  'triceps pushdown': 'Stahování kladky na triceps',
  kickback: 'Zapažování',
  dip: 'Tricepsové kliky na bradlech',
  dips: 'Tricepsové kliky na bradlech',

  'bent over row': 'Přítahy v předklonu',
  'upright row': 'Přítahy k bradě',
  'rear delt row': 'Přítahy na zadní ramena',
  'inverted row': 'Australské shyby',
  'pull up': 'Shyby',
  'pull ups': 'Shyby',
  'chin up': 'Shyby podhmatem',
  'chin ups': 'Shyby podhmatem',
  pullup: 'Shyby',
  chinup: 'Shyby podhmatem',
  pulldown: 'Stahování horní kladky',
  'lat pulldown': 'Stahování horní kladky',
  pullover: 'Přetahování',
  row: 'Přítahy',
  rows: 'Přítahy',
  'face pull': 'Přítahy k obličeji',

  'romanian deadlift': 'Rumunský mrtvý tah',
  'stiff leg deadlift': 'Mrtvý tah s napnutýma nohama',
  'sumo deadlift': 'Mrtvý tah sumo',
  deadlift: 'Mrtvý tah',
  'good morning': 'Předklony s činkou',

  'front squat': 'Přední dřep',
  'goblet squat': 'Goblet dřep',
  'split squat': 'Dřep v rozštěpu',
  'hack squat': 'Hack dřep',
  squat: 'Dřepy',
  squats: 'Dřepy',
  lunge: 'Výpady',
  lunges: 'Výpady',
  'step up': 'Výstupy na bednu',
  'step ups': 'Výstupy na bednu',
  'hip thrust': 'Zvedání pánve s činkou',
  'glute bridge': 'Most na hýždě',
  'leg curl machine': 'Zakopávání na stroji',

  'push up': 'Kliky',
  'push ups': 'Kliky',
  pushup: 'Kliky',
  pushups: 'Kliky',
  plank: 'Prkno',
  crunch: 'Zkracovačky',
  crunches: 'Zkracovačky',
  'sit up': 'Sedy-lehy',
  'sit ups': 'Sedy-lehy',
  situp: 'Sedy-lehy',
  'russian twist': 'Ruské twisty',
  twist: 'Rotace trupu',
  'mountain climber': 'Horolezec',
  burpee: 'Burpees',
  'jumping jack': 'Jumping jacks',
  'jump squat': 'Výskoky z dřepu',
  'box jump': 'Výskoky na bednu',
  'flutter kick': 'Střihy nohama',
  superman: 'Superman',
  'dead bug': 'Mrtvý brouk',
  'bird dog': 'Ptačí pes',

  fly: 'Rozpažování',
  flye: 'Rozpažování',
  flyes: 'Rozpažování',
  flys: 'Rozpažování',
  swing: 'Švihy',
  swings: 'Švihy',
  clean: 'Přemístění',
  snatch: 'Trh',
  'clean and jerk': 'Nadhoz',
  thruster: 'Thruster',
  'farmer walk': 'Farmářská chůze',
  'wood chop': 'Dřevorubec',
  'sled push': 'Tlačení saní',
  crossover: 'Stahování kladek',
  'cross over': 'Stahování kladek',
  'skull crusher': 'Francouzský tlak',
  'skull crushers': 'Francouzský tlak',
  'arnold press': 'Arnoldův tlak',
  'pistol squat': 'Pistol dřep',
  'turkish get up': 'Turecký vzpřim',
  hyperextension: 'Hyperextenze',
  hyperextensions: 'Hyperextenze',
  jackknife: 'Zavírací nůž',
  'side bend': 'Úklony',
  'side bends': 'Úklony',
  'side plank': 'Boční prkno',
  'side lunge': 'Boční výpady',
  'side lunges': 'Boční výpady',
  'walking lunge': 'Chodící výpady',
  'walking lunges': 'Chodící výpady',
  'concentration curls': 'Koncentrovaný zdvih',
  twists: 'Rotace trupu',
  'stationary bike': 'Rotoped',
  'v up': 'V-sedy',
  'v ups': 'V-sedy',
  'external rotation': 'Vnější rotace ramene',
  'internal rotation': 'Vnitřní rotace ramene',
  jerk: 'Nadhoz',
  rollout: 'Rollout',
  windmill: 'Větrný mlýn',
  raise: 'Zvedání',
  raises: 'Zvedání',
  pull: 'Přítah',
  push: 'Tlak',
  kick: 'Kopy',
  hold: 'Výdrž',
  walk: 'Chůze',
  run: 'Běh',
  jump: 'Výskoky',
  bridge: 'Most',
  rotation: 'Rotace',
  circles: 'Kroužení',
  abduction: 'Odtahování',
  adduction: 'Přitahování',
};

/**
 * Jádra, která sama o sobě nic neřeknou. „Tlak s kettlebellem střídavě“ je
 * dobrý název, holý „Tlak“ ne — proto takové jádro musí mít aspoň jedno
 * upřesnění, jinak cvik neprojde.
 */
const OBECNA_JADRA = new Set([
  'Tlak', 'Zvedání', 'Přítah', 'Kopy', 'Výdrž', 'Chůze', 'Běh', 'Výskoky',
  'Most', 'Rotace', 'Kroužení', 'Extenze', 'Odtahování', 'Přitahování',
]);

/** POLOHA — jak se cvik provádí. */
const POLOHY = {
  seated: 'vsedě',
  standing: 'vestoje',
  lying: 'vleže',
  kneeling: 'v kleku',
  incline: 'na šikmé lavici',
  decline: 'na záporné lavici',
  'flat bench': 'na rovné lavici',
  bench: 'na lavici',
  // POZOR: „bent“ smí znamenat předklon jen ve spojení „bent over“. Samotné
  // „bent“ v „bent-knee hip raise“ mluví o pokrčeném koleni a překlad
  // „v předklonu“ z toho udělal cvik, který nikdo nedělá.
  'bent over': 'v předklonu',
  'bent knee': 's pokrčenými koleny',
  'bent arm': 's pokrčenými pažemi',
  hanging: 've visu',
  hang: 've visu',
  'on knees': 'v kleku',
  prone: 'vleže na břiše',
  supine: 'vleže na zádech',
  floor: 'na zemi',
};

/**
 * VYBAVENÍ — čím se cvik dělá. `stem` je kmen, který se hledá v jádru: když
 * jádro slovo o vybavení už obsahuje, upřesnění se nepřidá. Bez toho vzniklo
 * ze „Cable Crossover“ „Stahování kladek na kladce“.
 */
const VYBAVENI = {
  dumbbell: { text: 's jednoručkami', stem: 'jednoruč' },
  dumbbells: { text: 's jednoručkami', stem: 'jednoruč' },
  barbell: { text: 's velkou činkou', stem: 'velkou činkou' },
  kettlebell: { text: 's kettlebellem', stem: 'kettlebell' },
  kettlebells: { text: 's kettlebelly', stem: 'kettlebell' },
  cable: { text: 'na kladce', stem: 'klad' },
  pulley: { text: 'na kladce', stem: 'klad' },
  'high cable': { text: 'na horní kladce', stem: 'klad' },
  'low cable': { text: 'na spodní kladce', stem: 'klad' },
  'high pulley': { text: 'na horní kladce', stem: 'klad' },
  'low pulley': { text: 'na spodní kladce', stem: 'klad' },
  machine: { text: 'na stroji', stem: 'stroji' },
  leverage: { text: 'na stroji', stem: 'stroji' },
  'leverage machine': { text: 'na stroji', stem: 'stroji' },
  smith: { text: 've Smithově stroji', stem: 'smith' },
  'smith machine': { text: 've Smithově stroji', stem: 'smith' },
  band: { text: 's gumou', stem: 'gum' },
  bands: { text: 's gumou', stem: 'gum' },
  'resistance band': { text: 's gumou', stem: 'gum' },
  'medicine ball': { text: 's medicinbalem', stem: 'medicinbal' },
  'ez bar': { text: 's EZ osou', stem: 'EZ os' },
  'e z bar': { text: 's EZ osou', stem: 'EZ os' },
  'straight bar': { text: 's rovnou osou', stem: 'rovnou os' },
  'exercise ball': { text: 's gymnastickým míčem', stem: 'míč' },
  'stability ball': { text: 's gymnastickým míčem', stem: 'míč' },
  bodyweight: { text: 's vlastní vahou', stem: 'vlastní vahou' },
  rope: { text: 's lanem', stem: 'lan' },
  bar: { text: 's osou', stem: 'os' },
  plate: { text: 's kotoučem', stem: 'kotouč' },
  treadmill: { text: 'na běžeckém pásu', stem: 'pás' },
};

/** VARIANTA — zúžení na konec věty. */
const VARIANTY = {
  'one arm': 'jednoruč',
  'single arm': 'jednoruč',
  'one armed': 'jednoruč',
  'two arm': 'obouruč',
  'two armed': 'obouruč',
  'one leg': 'jednonož',
  'single leg': 'jednonož',
  'one legged': 'jednonož',
  'single legged': 'jednonož',
  'close grip': 'úzkým úchopem',
  'wide grip': 'širokým úchopem',
  'narrow grip': 'úzkým úchopem',
  'reverse grip': 'podhmatem',
  'neutral grip': 'neutrálním úchopem',
  'hammer grip': 'neutrálním úchopem',
  'pronated grip': 'nadhmatem',
  'supinated grip': 'podhmatem',
  double: 'obouruč',
  'side lying': 'vleže na boku',
  'behind the neck': 'za hlavu',
  'behind neck': 'za hlavu',
  'behind the head': 'za hlavu',
  'behind head': 'za hlavu',
  'straight arm': 's napnutými pažemi',
  'straight leg': 's napnutýma nohama',
  'stiff legged': 's napnutýma nohama',
  'wide stance': 'v širokém postoji',
  'narrow stance': 'v úzkém postoji',
  'elevated': 'se zvýšenou podložkou',
  alternating: 'střídavě',
  alternate: 'střídavě',
  reverse: 'obráceně',
  isometric: 'izometricky',
  'to the side': 'stranou',
  overhead: 'nad hlavou',
  weighted: 'se zátěží',
  'palms up': 'dlaněmi vzhůru',
  'palms down': 'dlaněmi dolů',
  'palms in': 'dlaněmi k sobě',
  'palm up': 'dlaní vzhůru',
  'palm down': 'dlaní dolů',
  wide: 'širokým úchopem',
  narrow: 'úzkým úchopem',
  paused: 's výdrží',
  explosive: 'výbušně',
  slow: 'pomalu',
};

/** Slova, která nesou jen upřesnění partie a v češtině zaniknou v jádru. */
const ZANIKAJICI = new Set([
  'exercise', 'exercises', 'variation', 'style', 'position', 'grip', 'arm', 'arms',
  'leg', 'legs', 'body', 'chest', 'back', 'shoulder', 'shoulders', 'triceps',
  'tricep', 'biceps', 'bicep', 'calf', 'calves', 'ab', 'abs', 'abdominal',
  'glute', 'glutes', 'hamstring', 'hamstrings', 'quad', 'quads', 'lat', 'lats',
  'hip', 'hips', 'core', 'delt', 'delts', 'trap', 'traps', 'forearm', 'forearms',
  'wrist', 'knee', 'knees', 'hand', 'hands', 'foot', 'feet', 'neck', 'oblique',
  'obliques', 'upper', 'lower', 'middle', 'full', 'total', 'butt', 'inner',
  'outer', 'long', 'short', 'head', 'attachment', 'medium', 'power', 'stance',
]);

/** Ostrouhá název na porovnatelná slova. */
function naSlova(nazev) {
  return String(nazev || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Najde nejdelší frázi ze slovníku počínaje pozicí `i`.
 * @returns {{ hodnota: string, delka: number } | null}
 */
function najdiFrazi(slova, i, slovnik, maxDelka = 4) {
  for (let d = Math.min(maxDelka, slova.length - i); d >= 1; d -= 1) {
    const fraze = slova.slice(i, i + d).join(' ');
    if (Object.prototype.hasOwnProperty.call(slovnik, fraze)) {
      return { hodnota: slovnik[fraze], delka: d };
    }
  }
  return null;
}

/**
 * Český název cviku, nebo null když slovník na něco nestačil.
 *
 * Null NENÍ chyba volajícího — je to odpověď „tenhle cvik zatím neumíme
 * pojmenovat“. Importér ho podle toho zahodí a nechá o něm záznam.
 *
 * @param {string} nazevEn
 * @returns {{ nazev: string } | { nazev: null, nezname: string[] }}
 */
export function nazevCviku(nazevEn) {
  const slova = naSlova(nazevEn);
  if (slova.length === 0) return { nazev: null, nezname: [] };

  let jadro = null;
  const polohy = [];
  const vybaveni = [];
  const varianty = [];
  const nezname = [];

  let i = 0;
  while (i < slova.length) {
    // Pořadí hledání je záměrné: jádro první, ať „press“ neuteče jako varianta.
    const j = jadro ? null : najdiFrazi(slova, i, JADRA);
    if (j) {
      jadro = j.hodnota;
      i += j.delka;
      continue;
    }
    const va = najdiFrazi(slova, i, VARIANTY);
    if (va) {
      if (!varianty.includes(va.hodnota)) varianty.push(va.hodnota);
      i += va.delka;
      continue;
    }
    const vy = najdiFrazi(slova, i, VYBAVENI);
    if (vy) {
      vybaveni.push(vy.hodnota);
      i += vy.delka;
      continue;
    }
    const p = najdiFrazi(slova, i, POLOHY);
    if (p) {
      if (!polohy.includes(p.hodnota)) polohy.push(p.hodnota);
      i += p.delka;
      continue;
    }
    // Jádro už máme — druhý výskyt slovesa (např. „press“ v „press up“) zanikne.
    const opakovaneJadro = jadro ? najdiFrazi(slova, i, JADRA) : null;
    if (opakovaneJadro) {
      i += opakovaneJadro.delka;
      continue;
    }
    const s = slova[i];
    if (VYPLN.has(s) || ZANIKAJICI.has(s)) {
      i += 1;
      continue;
    }
    nezname.push(s);
    i += 1;
  }

  if (!jadro) return { nazev: null, nezname: nezname.length ? nezname : slova };
  if (nezname.length > 0) return { nazev: null, nezname };

  // Vybavení, které už zaznělo v jádru, se neopakuje.
  const vybaveniTexty = [];
  for (const v of vybaveni) {
    if (jadro.toLowerCase().includes(v.stem.toLowerCase())) continue;
    if (!vybaveniTexty.includes(v.text)) vybaveniTexty.push(v.text);
  }

  const upresneni = [...polohy, ...vybaveniTexty, ...varianty];
  if (upresneni.length === 0 && OBECNA_JADRA.has(jadro)) {
    return { nazev: null, nezname: ['_obecne_jadro'] };
  }

  return { nazev: [jadro, ...upresneni].join(' ') };
}

export const SLOVNIK_VELIKOST =
  Object.keys(JADRA).length
  + Object.keys(POLOHY).length
  + Object.keys(VYBAVENI).length
  + Object.keys(VARIANTY).length;
