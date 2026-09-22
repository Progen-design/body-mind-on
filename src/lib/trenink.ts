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

/** Stav dne ze serveru (`/api/stats/adherence`). */
export interface Adherence {
  planovanych_jidel: number;
  splnenych_jidel: number;
  treninkovy_den: boolean;
  trenink_splnen: boolean;
  pohyb_min: number;
  watch_workout_count: number;
  manual_workout_count: number;
}

/**
 * Podíl odcvičených cviků dne (0–1) — JEDINÝ výpočet „jak moc je trénink hotový"
 * pro hero, časovou osu i „Tvoje cesta" (PROMPT_DOLADENI_DNES.md).
 *
 * POZOR: `stav.trenink_splnen` ani `manual_workout_count` se nepoužívají,
 * když má den seznam cviků. Každé odškrtnutí cviku je v `daily_activity_completions`
 * řádek s activity_type 'workout', takže `get_daily_adherence` hlásí trénink
 * jako splněný už po PRVNÍM cviku — kroužek pak svítil „Hotovo" při 2 ze 4 cviků
 * (nahlášeno 21. 9. 2026). Rozhoduje počet odškrtnutých cviků; hodinky
 * (`watch_workout_count`) trénink uznají celý.
 */
export function podilTreninku(den: WorkoutDay, stav: Adherence | null = null): number {
  if (den.isCompleted || (stav?.watch_workout_count ?? 0) > 0) return 1;
  const cviky = den.exercises;
  if (cviky.length > 0) {
    return cviky.filter((c) => c.completed).length / cviky.length;
  }
  // Den bez seznamu cviků: jediný zdroj je ruční zápis / adherence.
  return stav?.trenink_splnen === true || (stav?.manual_workout_count ?? 0) > 0 ? 1 : 0;
}

/** Trénink je hotový, až když jsou odškrtnuté VŠECHNY cviky (nebo ho naměřily hodinky). */
export function jeTreninkHotovy(den: WorkoutDay, stav: Adherence | null = null): boolean {
  return podilTreninku(den, stav) >= 1;
}

/**
 * Kolik cviků je odškrtnutých z kolika — pro text „2 z 4 cviků". `null`, když
 * den nemá seznam cviků (pak není co počítat) nebo je hotový celý.
 */
export function rozpracovaneCviky(den: WorkoutDay, stav: Adherence | null = null): { hotovo: number; celkem: number } | null {
  const celkem = den.exercises.length;
  if (celkem === 0 || jeTreninkHotovy(den, stav)) return null;
  const hotovo = den.exercises.filter((c) => c.completed).length;
  return hotovo > 0 ? { hotovo, celkem } : null;
}

/** „2 z 4 cviků" se správným skloňováním. */
export function textCviku(hotovo: number, celkem: number): string {
  const slovo = celkem === 1 ? 'cviku' : 'cviků';
  return `${hotovo} z ${celkem} ${slovo}`;
}
