import type {
  UserProfile,
  WeightRecord,
  MealItem,
  WorkoutDay,
  HabitItem,
  BadHabitItem,
  AppleWatchBiometrics,
  ShoppingItem,
  UserPreferences
} from '../types';

export const initialProfile: UserProfile = {
  name: 'Jan Novák / Příkopa',
  status: 'AKTIVNÍ',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
  membershipPlan: 'Premium Performance & Hypertrofy Protocol',
  nextConsultationDate: 'Čtvrtek 27. srpna v 16:30',
  subtitle: 'Klient Body & Mind ON'
};

export const initialWeightRecords: Record<string, WeightRecord[]> = {
  '1M': [
    { date: '29.10.', weight: 101.9, fatPercent: 12.5, muscleKg: 87.1, bmi: 30.7, note: 'Ranní vážení nalačno' },
    { date: '05.11.', weight: 102.4, fatPercent: 12.3, muscleKg: 87.5, bmi: 30.9, note: 'Navýšení sacharidových vln' },
    { date: '12.11.', weight: 103.1, fatPercent: 12.0, muscleKg: 88.0, bmi: 31.1, note: 'Progresivní přetížení dřepy' },
    { date: '19.11.', weight: 103.0, fatPercent: 11.9, muscleKg: 88.1, bmi: 31.1, note: 'Regenerační den' },
    { date: '26.11.', weight: 103.5, fatPercent: 11.8, muscleKg: 88.4, bmi: 31.3, note: 'Kontrola kompozice' },
    { date: '02.12.', weight: 103.9, fatPercent: 11.7, muscleKg: 88.6, bmi: 31.4, note: 'Hypertrofický cyklus týden 3' },
    { date: '20.08.', weight: 104.6, fatPercent: 11.6, muscleKg: 88.9, bmi: 31.6, note: 'Aktuální Withings Body Scan měření' }
  ],
  '3M': [
    { date: '20.05.', weight: 100.2, fatPercent: 13.2, muscleKg: 85.5, bmi: 30.3 },
    { date: '05.06.', weight: 101.0, fatPercent: 12.9, muscleKg: 86.2, bmi: 30.5 },
    { date: '20.06.', weight: 101.8, fatPercent: 12.6, muscleKg: 86.9, bmi: 30.8 },
    { date: '05.07.', weight: 102.7, fatPercent: 12.2, muscleKg: 87.6, bmi: 31.0 },
    { date: '20.07.', weight: 103.6, fatPercent: 11.9, muscleKg: 88.3, bmi: 31.3 },
    { date: '20.08.', weight: 104.6, fatPercent: 11.6, muscleKg: 88.9, bmi: 31.6 }
  ],
  '6M': [
    { date: '20.02.', weight: 98.2, fatPercent: 14.3, muscleKg: 83.0, bmi: 29.7 },
    { date: '20.03.', weight: 99.5, fatPercent: 13.8, muscleKg: 84.3, bmi: 30.1 },
    { date: '20.04.', weight: 100.8, fatPercent: 13.3, muscleKg: 85.8, bmi: 30.5 },
    { date: '20.05.', weight: 101.9, fatPercent: 12.7, muscleKg: 87.1, bmi: 30.8 },
    { date: '20.06.', weight: 103.2, fatPercent: 12.1, muscleKg: 88.2, bmi: 31.2 },
    { date: '20.08.', weight: 104.6, fatPercent: 11.6, muscleKg: 88.9, bmi: 31.6 }
  ],
  '1R': [
    { date: '08.2025', weight: 95.0, fatPercent: 15.8, muscleKg: 79.2, bmi: 28.7 },
    { date: '11.2025', weight: 97.4, fatPercent: 14.7, muscleKg: 81.9, bmi: 29.5 },
    { date: '02.2026', weight: 99.2, fatPercent: 13.9, muscleKg: 84.2, bmi: 30.0 },
    { date: '05.2026', weight: 101.8, fatPercent: 12.5, muscleKg: 87.0, bmi: 30.8 },
    { date: '08.2026', weight: 104.6, fatPercent: 11.6, muscleKg: 88.9, bmi: 31.6 }
  ]
};

export const initialMeals: MealItem[] = [
  {
    id: 'meal-1',
    type: 'Snídaně',
    time: '07:30',
    title: 'Ovesná kaše s lesním ovocem a proteinem',
    calories: 420,
    protein: 32,
    carbs: 52,
    fat: 8,
    completed: true,
    ingredients: [
      '70g bio jemné ovesné vločky',
      '25g syrovátkový izolát (Hydro Whey vanilka)',
      '120g lesní plody (borůvky, maliny)',
      '10g chia semínka',
      '200ml mandlové mléko bez cukru'
    ],
    recipe: {
      prepTimeMin: 5,
      cookTimeMin: 4,
      difficulty: 'Snadné',
      instructions: [
        'Vločky zalijte mandlovým mlékem a na mírném plameni povařte 3–4 minuty do zhoustnutí.',
        'Odstavte z tepla a nechte 2 minuty zchladnout na cca 60 °C (aby se neznehodnotil syrovátkový protein).',
        'Vymíchejte proteinový prášek s trochou vlažné vody a jemně vmíchejte do kaše.',
        'Ozdobte čerstvými lesními plody a posypte chia semínky.'
      ],
      tips: 'Pro krémovější konzistenci můžete nechat vločky přes noc namočené v lednici.',
      replacements: ['Místo mandlového mléka: ovesné nebo kravské bezlaktózové', 'Místo chia semínek: drcená lněná semínka nebo mandlové plátky']
    }
  },
  {
    id: 'meal-2',
    type: 'Oběd',
    time: '12:45',
    title: 'Jasmínová rýže s vejcem a restovaným hovězím',
    calories: 614,
    protein: 46,
    carbs: 74,
    fat: 14,
    completed: true,
    ingredients: [
      '180g libové hovězí mleté (95% masa)',
      '90g suché jasmínové rýže (cca 220g vařené)',
      '2x bio vejce z volného chovu',
      '120g baby špenát a jarní cibulka',
      '5ml sezamový olej a tamari sojová omáčka'
    ],
    recipe: {
      prepTimeMin: 10,
      cookTimeMin: 15,
      difficulty: 'Střední',
      instructions: [
        'Uvařte jasmínovou rýži v osolené vodě v poměru 1:1.5.',
        'Na pánvi s kapkou sezamového oleje orestujte mleté hovězí maso s prolisovaným česnekem a tamari omáčkou cca 7 minut.',
        'Přidejte nakrájenou jarní cibulku a baby špenát a nechte zavadnout.',
        'Vedle na suché pánvi připravte dvě volská oka se tekutým žloutkem.',
        'Naservírujte rýži, navrch dejte hovězí směs a položte teplá vejce.'
      ],
      tips: 'Tekutý žloutek poslouží jako skvělá přírodní omáčka bez nutnosti přidávat těžké dresinky.',
      replacements: ['Místo hovězího: krůtí prsní nudličky nebo tempeh', 'Místo jasmínové rýže: rýže basmati nebo quinoa']
    }
  },
  {
    id: 'meal-3',
    type: 'Dopolední svačina',
    time: '10:15',
    title: 'Zralý banán (Předtréninková rychlá energie)',
    calories: 204,
    protein: 2,
    carbs: 48,
    fat: 1,
    completed: true,
    ingredients: [
      '1x velký banán (cca 160g)',
      'Sklenice čisté vody s elektrolyty'
    ],
    recipe: {
      prepTimeMin: 1,
      cookTimeMin: 0,
      difficulty: 'Snadné',
      instructions: [
        'Konzumujte 45 minut před plánovaným silovým výkonem pro optimalizaci glykogenu a svalového napumpování.'
      ],
      tips: 'Bohatý zdroj draslíku a rychlých sacharidů pro prevenci svalových křečí.',
      replacements: ['Místo banánu: 40g sušených datlí Medjool']
    }
  },
  {
    id: 'meal-4',
    type: 'Odpolední svačina',
    time: '16:00',
    title: 'Farmářský bílý jogurt s ořechy',
    calories: 267,
    protein: 18,
    carbs: 16,
    fat: 15,
    completed: true,
    ingredients: [
      '180g řecký jogurt 5% tuku',
      '20g vlašské ořechy bio',
      '10g strouhaná 85% hořká čokoláda',
      'Cejlonská skořice'
    ],
    recipe: {
      prepTimeMin: 3,
      cookTimeMin: 0,
      difficulty: 'Snadné',
      instructions: [
        'Do misky vložte poctivý řecký jogurt.',
        'Posypte nahrubo nasekanými vlašskými ořechy a hoblinkami vysokoprocentní čokolády.',
        'Završte špetkou pravé cejlonské skořice.'
      ],
      tips: 'Tento snack dodá esenciální mastné kyseliny pro podporu tvorby testosteronu a buněčných membrán.',
      replacements: ['Místo vlašských ořechů: pekanové ořechy nebo mandle']
    }
  },
  {
    id: 'meal-5',
    type: 'Večeře',
    time: '19:30',
    title: 'Krůtí prsa s pečeným bramborem a zeleninou',
    calories: 525,
    protein: 48,
    carbs: 58,
    fat: 10,
    completed: true,
    ingredients: [
      '200g krůtí prsní řízek na bylinkách',
      '250g rané brambory s rozmarýnem',
      '150g dušená zelená fazolka a cuketa',
      '8ml extra panenský olivový olej'
    ],
    recipe: {
      prepTimeMin: 10,
      cookTimeMin: 25,
      difficulty: 'Snadné',
      instructions: [
        'Brambory omyjte, nakrájejte na měsíčky, promíchejte s rozmarýnem a lžičkou olivového oleje a pečte v horkovzdušné fritéze/troubě na 200 °C po dobu 20 minut.',
        'Krůtí prsa osolte, opepřete a zprudka opečte na grilovací pánvi 3 minuty z každé strany.',
        'Na páře poduste zelené fazolky s cuketou cca 5 minut do křupava.',
        'Servírujte s čerstvou pažitkou.'
      ],
      tips: 'Krůtí maso je bohaté na L-tryptofan, prekurzor melatoninu, který zásadně zlepšuje hloubku spánku.',
      replacements: ['Místo krůtích prsou: kuřecí prsa nebo treska', 'Místo brambor: pečené batáty nebo dýně hokkaido']
    }
  }
];

export const appleWatchBiometricsData: AppleWatchBiometrics = {
  scaleConnected: true,
  appleWatchConnected: true,
  lastSyncTime: 'Dnes v 11:42 přes Apple HealthKit',
  recoveryScore: 70,
  recoveryStatus: 'Ubrat intenzitu',
  recoveryAdvice: 'Dnešní hodnota HRV (20,6 ms) a mírně zvýšený klidový tep indikují centrální únavu nervové soustavy po včerejším tréninku nohou. Doporučujeme nepřidávat drop-sety do selhání a prodloužit pauzy mezi sériemi na 90–120 sekund.',
  hrvMs: 20.6,
  hrvBaselineMs: 42.0,
  restingHrBpm: 68.0,
  sleepDuration: '7h 48m',
  deepSleepDuration: '2h 15m',
  sleepEfficiencyPercent: 89,
  stepsToday: 9546,
  stepsTarget: 10000,
  activeEnergyKcal: 1678,
  activeEnergyTargetKcal: 1500,
  exerciseMinutes: 96.0,
  exerciseMinutesTarget: 60.0,
  bloodOxygenPercent: 94.0,
  recentWorkouts: [
    {
      id: 'wo-1',
      type: 'Silový trénink (Ramena & Triceps)',
      icon: 'dumbbell',
      time: '08:15 – 09:10',
      durationMin: 55,
      caloriesBurned: 440,
      avgHr: 142,
      maxHr: 174
    },
    {
      id: 'wo-2',
      type: 'Plavání v bazénu (Regenerační)',
      icon: 'waves',
      time: '14:30 – 15:12',
      durationMin: 42,
      caloriesBurned: 380,
      avgHr: 128,
      maxHr: 151
    }
  ],
  hrvTrend: [
    { day: '14.8.', value: 44.2 },
    { day: '15.8.', value: 41.5 },
    { day: '16.8.', value: 38.0 },
    { day: '17.8.', value: 45.1 },
    { day: '18.8.', value: 36.4 },
    { day: '19.8.', value: 29.8 },
    { day: '20.8.', value: 20.6 }
  ],
  restingHrTrend: [
    { day: '14.8.', value: 58.0 },
    { day: '15.8.', value: 59.5 },
    { day: '16.8.', value: 61.0 },
    { day: '17.8.', value: 57.5 },
    { day: '18.8.', value: 63.0 },
    { day: '19.8.', value: 66.5 },
    { day: '20.8.', value: 68.0 }
  ],
  stepsTrend: [
    { day: '14.8.', value: 11200 },
    { day: '15.8.', value: 12400 },
    { day: '16.8.', value: 8900 },
    { day: '17.8.', value: 14100 },
    { day: '18.8.', value: 10200 },
    { day: '19.8.', value: 13500 },
    { day: '20.8.', value: 9546 }
  ],
  energyTrend: [
    { day: '14.8.', value: 1420 },
    { day: '15.8.', value: 1580 },
    { day: '16.8.', value: 1310 },
    { day: '17.8.', value: 1820 },
    { day: '18.8.', value: 1490 },
    { day: '19.8.', value: 1750 },
    { day: '20.8.', value: 1678 }
  ]
};

export const weeklyWorkouts: WorkoutDay[] = [
  {
    dayName: 'Pondělí',
    dayShort: 'PO',
    title: 'Hrudník & Biceps',
    durationMin: 60,
    caloriesBurned: 480,
    isToday: false,
    isCompleted: true,
    focus: 'Tlaková síla a vrchol bicepsu',
    exercises: [
      { id: 'e1', name: 'Bench press na rovné lavici', sets: 4, reps: '6-8', weightKg: 130, restSec: 120, targetMuscle: 'Střední prsní svaly', completed: true },
      { id: 'e2', name: 'Šikmé tlaky s jednoručkami 30°', sets: 4, reps: '8-10', weightKg: 42, restSec: 90, targetMuscle: 'Horní prsa', completed: true },
      { id: 'e3', name: 'Kliky na bradlech se zátěží', sets: 3, reps: '10-12', weightKg: 20, restSec: 90, targetMuscle: 'Dolní prsa', completed: true },
      { id: 'e4', name: 'Bicepsový zdvih s EZ osou', sets: 4, reps: '8-10', weightKg: 45, restSec: 75, targetMuscle: 'Biceps', completed: true }
    ]
  },
  {
    dayName: 'Úterý',
    dayShort: 'ÚT',
    title: 'Nohy & Lýtka',
    durationMin: 70,
    caloriesBurned: 580,
    isToday: false,
    isCompleted: true,
    focus: 'Kvadricepsy, hamstringy a hluboký dřep',
    exercises: [
      { id: 'e5', name: 'Zadní dřep s velkou činkou', sets: 5, reps: '5', weightKg: 175, restSec: 150, targetMuscle: 'Kvadricepsy & Gluteály', completed: true },
      { id: 'e6', name: 'Rumunský mrtvý tah s jednoručkami', sets: 4, reps: '8-10', weightKg: 46, restSec: 90, targetMuscle: 'Hamstringy', completed: true },
      { id: 'e7', name: 'Legpress 45°', sets: 3, reps: '12-15', weightKg: 280, restSec: 90, targetMuscle: 'Nohy', completed: true },
      { id: 'e8', name: 'Výpony na lýtka ve stoje', sets: 4, reps: '15-20', weightKg: 90, restSec: 60, targetMuscle: 'Lýtka', completed: true }
    ]
  },
  {
    dayName: 'Středa',
    dayShort: 'ST',
    title: 'Regenerace & Plavání',
    durationMin: 45,
    caloriesBurned: 380,
    isToday: false,
    isCompleted: true,
    focus: 'Aktivní odpočinek, mobilita a aerobní základ',
    exercises: [
      { id: 'e9', name: 'Plavání kraul & prsa', sets: 1, reps: '40 min (1 200m)', restSec: 0, targetMuscle: 'Celé tělo', completed: true },
      { id: 'e10', name: 'Dynamická mobilita a pěnový válec', sets: 1, reps: '15 min', restSec: 0, targetMuscle: 'Fascie & Klouby', completed: true }
    ]
  },
  {
    dayName: 'Čtvrtek',
    dayShort: 'ČT',
    title: 'Ramena & Triceps',
    durationMin: 55,
    caloriesBurned: 440,
    isToday: true,
    isCompleted: false,
    focus: 'Deltové svaly (střední + přední) & podkova tricepsu',
    exercises: [
      { id: 'e11', name: 'Military Press s velkou činkou', sets: 4, reps: '6-8', weightKg: 82.5, restSec: 120, targetMuscle: 'Přední delty', completed: true },
      { id: 'e12', name: 'Upažování s jednoručkami vestoje', sets: 4, reps: '12-15', weightKg: 18, restSec: 75, targetMuscle: 'Boční delty', completed: true },
      { id: 'e13', name: 'Facepulls na horní kladce', sets: 4, reps: '15', weightKg: 35, restSec: 60, targetMuscle: 'Zadní delty & Rotátory', completed: false },
      { id: 'e14', name: 'Francouzský tlak s EZ činkou vleže', sets: 4, reps: '8-10', weightKg: 47.5, restSec: 90, targetMuscle: 'Dlouhá hlava tricepsu', completed: false },
      { id: 'e15', name: 'Stahování lana na kladce', sets: 3, reps: '12-15', weightKg: 30, restSec: 60, targetMuscle: 'Triceps laterální hlava', completed: false }
    ]
  },
  {
    dayName: 'Pátek',
    dayShort: 'PÁ',
    title: 'Záda & Zadní delty',
    durationMin: 65,
    caloriesBurned: 520,
    isToday: false,
    isCompleted: false,
    focus: 'Šířka a hustota zad, síla přítahů',
    exercises: [
      { id: 'e16', name: 'Mrtvý tah (klasický)', sets: 4, reps: '5', weightKg: 200, restSec: 180, targetMuscle: 'Vzpřimovače & Celá záda', completed: false },
      { id: 'e17', name: 'Shyby na hrazdě se zátěží', sets: 4, reps: '6-8', weightKg: 15, restSec: 120, targetMuscle: 'Latissimus', completed: false },
      { id: 'e18', name: 'Přítahy jednoručky v předklonu', sets: 3, reps: '10', weightKg: 48, restSec: 90, targetMuscle: 'Střední záda', completed: false }
    ]
  },
  {
    dayName: 'Sobota',
    dayShort: 'SO',
    title: 'Core & Hluboký stabilizační systém',
    durationMin: 40,
    caloriesBurned: 260,
    isToday: false,
    isCompleted: false,
    focus: 'Břišní stěna, rotační síla, držení těla',
    exercises: [
      { id: 'e19', name: 'Zvedání nohou ve visu na hrazdě', sets: 4, reps: '12-15', restSec: 60, targetMuscle: 'Přímý břišní sval', completed: false },
      { id: 'e20', name: 'Paloff Press na kladce', sets: 3, reps: '12 na stranu', weightKg: 17.5, restSec: 60, targetMuscle: 'Šikmé břišní svaly', completed: false }
    ]
  },
  {
    dayName: 'Neděle',
    dayShort: 'NE',
    title: 'Kompletní regenerace & Sauna',
    durationMin: 60,
    caloriesBurned: 180,
    isToday: false,
    isCompleted: false,
    focus: 'Finská sauna 3 cykly, studená lázeň, protažení',
    exercises: [
      { id: 'e21', name: 'Saunový regenerační protokol', sets: 3, reps: '15 min', restSec: 10, targetMuscle: 'Neuromuskulární regenerace', completed: false }
    ]
  }
];

export const initialHabits: HabitItem[] = [
  {
    id: 'habit-1',
    title: 'Vyvážené stravování',
    subtitle: 'Makro cíle splněny (B 19%, S 54%, T 27%)',
    completed: true,
    iconType: 'food',
    value: '2 030 / 2 164 kcal',
    target: '2 164 kcal'
  },
  {
    id: 'habit-2',
    title: 'Kvalitní spánek',
    subtitle: 'Hluboký spánek 2h 15m (89% efektivita)',
    completed: true,
    iconType: 'sleep',
    value: '7 h 48 m',
    target: '7 h 30 m+'
  },
  {
    id: 'habit-3',
    title: 'Pitný režim',
    subtitle: 'Denní hydratace a elektrolyty',
    completed: true,
    iconType: 'water',
    value: '3,4 L',
    target: '3,5 L'
  },
  {
    id: 'habit-4',
    title: 'Denní aktivita',
    subtitle: 'Kroky & NEAT pohyb',
    completed: false,
    iconType: 'steps',
    value: '9 546 kroků',
    target: '10 000 kroků'
  }
];

export const initialBadHabits: BadHabitItem[] = [
  {
    id: 'bad-1',
    title: 'Junk food / průmyslový cukr',
    description: 'Vyhýbání se rafinovaným sladkostem, fast foodu a sladkým nápojům.',
    cleanDaysStreak: 18,
    status: 'clean',
    lastResistedNote: 'Včera večer úspěšně překonána chuť na čokoládu po večeři (nahrazeno bylinkovým čajem).'
  },
  {
    id: 'bad-2',
    title: 'Ponocování u modrého světla',
    description: 'Vypnutí obrazovek (mobil, televize) minimálně 45 minut před usnutím.',
    cleanDaysStreak: 8,
    status: 'clean',
    lastResistedNote: 'Nasazeny brýle blokující červené/modré spektrum od 21:00.'
  }
];



export const initialShoppingList: ShoppingItem[] = [
  // Maso & Ryby
  { id: 's1', name: 'Libové hovězí maso (mleté 95% nebo flank)', amount: '1 200 g', category: 'Maso & Ryby', checked: true },
  { id: 's2', name: 'Krůtí prsní řízky bio', amount: '1 000 g', category: 'Maso & Ryby', checked: false },
  { id: 's3', name: 'Čerstvý filet z divokého lososa', amount: '600 g', category: 'Maso & Ryby', checked: false },

  // Mléčné výrobky & Vejce
  { id: 's4', name: 'Čerstvá bio vejce z volného chovu', amount: '20 ks', category: 'Mléčné výrobky & Vejce', checked: true },
  { id: 's5', name: 'Řecký jogurt 5% tuku (Milko / Authentic)', amount: '6x 180 g', category: 'Mléčné výrobky & Vejce', checked: true },
  { id: 's6', name: 'Mandlové mléko bez přidaného cukru', amount: '2 l', category: 'Mléčné výrobky & Vejce', checked: false },

  // Přílohy & Pečivo
  { id: 's7', name: 'Jemné bio ovesné vločky', amount: '1 000 g', category: 'Přílohy & Pečivo', checked: true },
  { id: 's8', name: 'Jasmínová prémiová rýže', amount: '1 000 g', category: 'Přílohy & Pečivo', checked: false },
  { id: 's9', name: 'Rané brambory s tenkou slupkou', amount: '2 500 g', category: 'Přílohy & Pečivo', checked: false },
  { id: 's10', name: 'Trikolóra Quinoa', amount: '500 g', category: 'Přílohy & Pečivo', checked: false },

  // Zelenina & Ovoce
  { id: 's11', name: 'Banány zralé', amount: '1 trs (cca 7 ks)', category: 'Zelenina & Ovoce', checked: true },
  { id: 's12', name: 'Čerstvé borůvky & maliny', amount: '4x 125 g', category: 'Zelenina & Ovoce', checked: false },
  { id: 's13', name: 'Baby špenát bio', amount: '2x 200 g', category: 'Zelenina & Ovoce', checked: false },
  { id: 's14', name: 'Zelený chřest a cuketa', amount: '600 g', category: 'Zelenina & Ovoce', checked: false },
  { id: 's15', name: 'Jarní cibulka & čerstvý rozmarýn', amount: '2 svazky', category: 'Zelenina & Ovoce', checked: true },

  // Ořechy, Tuky & Ostatní
  { id: 's16', name: 'Vlašská jádra ořechů bio', amount: '300 g', category: 'Ořechy, Tuky & Ostatní', checked: true },
  { id: 's17', name: 'Chia semínka', amount: '250 g', category: 'Ořechy, Tuky & Ostatní', checked: true },
  { id: 's18', name: 'Extra panenský olivový olej za studena lisovaný', amount: '1 láhev (750 ml)', category: 'Ořechy, Tuky & Ostatní', checked: false },
  { id: 's19', name: 'Hydro Whey vanilkový izolát', amount: '1 dóza (1 000 g)', category: 'Ořechy, Tuky & Ostatní', checked: true }
];

export const initialPreferences: UserPreferences = {
  dailyCalorieTarget: 2164,
  proteinRatioPercent: 19,
  carbsRatioPercent: 54,
  fatRatioPercent: 27,
  targetWeightKg: 102.0,
  currentHeightCm: 188,
  weeklyWorkoutsTarget: 5,
  withingsAutoSync: true,
  appleHealthAutoSync: true,
  tedAiProactiveTips: true
};
