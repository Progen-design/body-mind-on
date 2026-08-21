/**
 * Zásoba cviků z databáze pro skládání plánu.
 *
 * PROČ TENHLE SOUBOR VZNIKL. buildExercisePoolFromTemplates() bere nabídku ze
 * šablon v lib/workoutTemplates.js. Pro posilovnu je to 28 řádků, ale po
 * odečtení duplicit jen 8 různých cviků — a přesně tolik jich naměřeně dostal
 * uživatel do 15 týdenních slotů. V exercise_asset_registry přitom leželo 46
 * cviků, kterých se plánovač nikdy nezeptal. Doplňovat katalog importem by
 * bez tohohle kroku nemělo žádný efekt: nové řádky by nikdo nečetl.
 *
 * VYBAVENÍ SI HLÍDÁME SAMI. Nabídku nelze jen rozšířit a spolehnout se, že ji
 * adaptExerciseForTrainingEnvironment() dorovná — ta funkce pracuje s natvrdo
 * vypsanými seznamy kanonických klíčů a NEZNÁMÝ KLÍČ PROPUSTÍ BEZE ZMĚNY.
 * Importovaný cvik s velkou činkou by tudy prošel až do tréninku pro cvičení
 * doma bez náčiní. Proto se tady filtruje podle equipment_class, ne až potom.
 */
import { supabaseServer } from './supabaseServer.js';
import { parseTrainingEnvironment, parseAvailableEquipment, resolveWorkoutTrainingEnvironment } from './trainingEnvironment.js';
import { objednejChybejiciPokryti, PRIORITA } from './exerciseImportQueue.js';

/** Co uživatelovo náčiní odemyká za třídy cviků. */
const NACINI_NA_TRIDU = Object.freeze({
  dumbbells: 'dumbbell',
  kettlebell: 'kettlebell',
  bands: 'band',
});

/** V posilovně je k dispozici všechno. */
const TRIDY_V_POSILOVNE = Object.freeze([
  'body_weight', 'dumbbell', 'barbell', 'cable', 'machine', 'kettlebell', 'band',
]);

/**
 * Třídy cviků, které smí uživatel dostat.
 *
 * @param {object} bodyMetrics
 * @returns {string[]}
 */
export function povoleneTridyVybaveni(bodyMetrics = {}) {
  const env = resolveWorkoutTrainingEnvironment(parseTrainingEnvironment(bodyMetrics));
  if (env === 'gym') return [...TRIDY_V_POSILOVNE];

  // Doma vždycky vlastní váha, zbytek jen podle toho, co uživatel opravdu má.
  const tridy = new Set(['body_weight']);
  for (const naciny of parseAvailableEquipment(bodyMetrics)) {
    const trida = NACINI_NA_TRIDU[naciny];
    if (trida) tridy.add(trida);
  }
  return [...tridy];
}

/**
 * Cviky z katalogu ve tvaru, kterému rozumí skladač.
 *
 * Vrací jen řádky s usable_in_plan — o tom, co je použitelné, rozhoduje
 * trigger v databázi, ne tenhle kód.
 *
 * @param {object} bodyMetrics
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<object>>}
 */
export async function nactiKatalogovouZasobu(bodyMetrics = {}, opts = {}, client = supabaseServer) {
  const tridy = povoleneTridyVybaveni(bodyMetrics);
  if (tridy.length === 0) return [];

  const { data, error } = await client
    .from('exercise_asset_registry')
    .select('canonical_key, display_name_cs, exercisedb_name, equipment_class, primary_muscle')
    .eq('usable_in_plan', true)
    .in('equipment_class', tridy)
    .limit(Number(opts.limit) || 500);

  if (error) {
    // Nabídka z katalogu je vylepšení, ne podmínka. Když se nenačte, plán se
    // složí ze šablon jako dřív — horší, ale pořád platný.
    console.warn('[exerciseCatalogPool] katalog se nenačetl, jedu jen ze šablon', error.message);
    return [];
  }

  return (data || []).map((r) => ({
    canonical_key: r.canonical_key,
    search_term: r.exercisedb_name || r.canonical_key,
    name_cs: r.display_name_cs,
    primary_muscle: r.primary_muscle,
    equipment_class: r.equipment_class,
    sets: 3,
    reps: '8-12',
    duration_sec: null,
  }));
}

/**
 * Skladači došla nabídka → objednávka na doplnění katalogu.
 *
 * Objednává se pro náčiní, které TENHLE uživatel má, ne pro celý slovník:
 * když dojdou cviky s vlastní vahou, doplňovat kladky nikomu nepomůže.
 * Duplicitní objednávky odchytí unikátní index v DB, takže tohle smí běžet
 * při každém skládání plánu.
 *
 * Selhání se jen zaloguje. Objednávka je údržba katalogu — kdyby kvůli ní
 * spadlo generování plánu, uživatel by zaplatil za cizí problém.
 *
 * @param {{ dosla_nabidka?: number }} scalerStats
 * @param {object} bodyMetrics
 * @param {string} [requestId]
 */
export async function objednejChybejiciCviky(scalerStats, bodyMetrics = {}, requestId = null) {
  const kolikrat = Number(scalerStats?.dosla_nabidka) || 0;
  if (kolikrat <= 0) return { objednano: [] };

  try {
    const objednano = await objednejChybejiciPokryti({
      tridy: povoleneTridyVybaveni(bodyMetrics),
      priorita: PRIORITA.NENI_NAHRADA,
      zdroj: 'demand',
    });
    if (objednano.length > 0) {
      console.info('[exerciseCatalogPool] objednány chybějící cviky', {
        requestId, kolikrat, objednano,
      });
    }
    return { objednano };
  } catch (err) {
    console.warn('[exerciseCatalogPool] objednávka cviků selhala', err?.message || err);
    return { objednano: [], error: err?.message || String(err) };
  }
}
