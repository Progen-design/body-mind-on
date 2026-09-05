// Vyber treninkoveho dne na jednom miste. Driv si kazda komponenta sahala
// do pole vlastnim zpusobem (workouts[3]) a plan se 3 dny shodil stranku.
import type { WorkoutDay } from '../types';

/**
 * Zástupce pro stav „v plánu dnes žádný trénink není".
 * Prázdný plán je platný stav — nový uživatel, plán se právě generuje,
 * nebo je prostě den volna. Není to chybějící údaj.
 */
export const DEN_BEZ_TRENINKU: WorkoutDay = {
  dayName: '',
  dayShort: '',
  title: 'Dnes bez tréninku',
  durationMin: 0,
  caloriesBurned: 0,
  isToday: true,
  isCompleted: false,
  focus: '',
  exercises: []
};

/**
 * Pozná zástupce (i den volna) od skutečně naplánovaného tréninku.
 *
 * `maTrenink === false` je EXPLICITNÍ den volna z `naTreninky()`
 * (docs/DALSI_KROK.md 8.14) — od 8.14 nese neprázdné `dayName` stejně jako
 * skutečný trénink, takže samotné `dayName !== ''` už nestačí. Když
 * `maTrenink` chybí (starší volající, testovací fixtury), zůstává původní
 * pravidlo beze změny.
 */
export function jeNaplanovany(workout: WorkoutDay): boolean {
  if (workout.maTrenink === false) return false;
  return workout.dayName !== '' || workout.exercises.length > 0;
}

/**
 * Dny plánu, které SKUTEČNĚ mají trénink — bez dnů volna.
 *
 * `naTreninky()` (docs/DALSI_KROK.md 8.14) teď vrací všech sedm dnů, takže
 * `workouts[0]` už není spolehlivě první trénink — může to být pondělní
 * volno. Cokoli, co dřív spoléhalo na „první den pole = první trénink",
 * musí filtrovat přes tuhle funkci, na jednom místě, ne v každé komponentě
 * zvlášť (viz hlavička souboru).
 */
export function treninkoveDny(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.filter(w => w.maTrenink !== false);
}

/**
 * Trénink na dnešek: označený `isToday`, jinak první TRÉNINKOVÝ den plánu
 * (`treninkoveDny()` — dny volna se jako záskok nepočítají, docs/DALSI_KROK.md
 * 8.14). Nikdy nevrací `undefined` — volající čtou `.title` bez guardu.
 *
 * FALLBACK NA PRVNÍ TRÉNINKOVÝ DEN PLATÍ JEN TAM, KDE SI HO VOLAJÍCÍ SÁM
 * HLÍDÁ (`vybranyTrenink()` a záložka Tréninkový plán, která o sobě otevřeně
 * tvrdí „nejbližší trénink v plánu", ne „dnešní" — pozná fallback podle
 * `.isToday === false` a nadpis tomu přizpůsobí). Kdo `.isToday`
 * nekontroluje a nadpis má napevno „Dnešní trénink" (Karta 4 v
 * OverviewBentoGrid, App.tsx), potřebuje `dnesniTreninkPresne()` níž —
 * viz docs/DALSI_KROK.md 6.9.
 */
export function dnesniTrenink(workouts: WorkoutDay[]): WorkoutDay {
  return workouts.find(w => w.isToday) ?? treninkoveDny(workouts)[0] ?? DEN_BEZ_TRENINKU;
}

/**
 * Trénink na dnešek, PŘESNĚ — bez záskoku cizím dnem. Když dnes v plánu
 * nic není (den volna), vrátí `DEN_BEZ_TRENINKU`, ne první den plánu.
 *
 * Nález 31. 8. 2026: plán po/st/pá zobrazený v neděli ukazoval nadpis
 * „Dnešní trénink" se štítkem „Pátek" — `dnesniTrenink()` spadla na
 * `workouts[0]` a karta to vydávala za dnešek, protože sama `.isToday`
 * nekontroluje. Použij tuhle funkci všude, kde se „dnešní trénink" ukazuje
 * bez dalšího rozlišení — `dnesniTrenink()` beze změny zůstává tam, kde
 * záskok cizím dnem je součástí zamýšleného chování.
 */
export function dnesniTreninkPresne(workouts: WorkoutDay[]): WorkoutDay {
  return workouts.find(w => w.isToday) ?? DEN_BEZ_TRENINKU;
}

/**
 * Trénink pro vybraný den. Když vybraný den v plánu není (uživatel nic
 * nevybral, nebo se plán mezitím přegeneroval), spadne to na dnešek.
 */
export function vybranyTrenink(
  workouts: WorkoutDay[],
  vybranyDen: string | null
): WorkoutDay {
  if (vybranyDen) {
    const nalezeny = workouts.find(w => w.dayName === vybranyDen);
    if (nalezeny) return nalezeny;
  }
  return dnesniTrenink(workouts);
}
