/**
 * Import cviků z free-exercise-db podle otevřených objednávek.
 *
 * Protějšek lib/recipeGeneratorRun.js, ale s jedním podstatným rozdílem:
 * u receptů generuje obsah model, tady se jen PŘEBÍRÁ z hotového datasetu.
 * Žádné volání OpenAI, žádná cena za běh, žádná nejistota v obsahu — jen
 * překlad názvu slovníkem a tvrdé brány.
 *
 * ZDROJ: github.com/yuhonas/free-exercise-db, licence Unlicense (volné dílo).
 * 873 cviků, u každého dvě fotky hostované na raw.githubusercontent.com.
 *
 * CO SE ZAHAZUJE A PROČ
 *   - neznámé vybavení        nedá se porovnat s tím, co uživatel doma má
 *   - partie mimo slovník     nešlo by ji objednat ani změřit
 *   - kategorie stretching    protahování není hlavní cvik tréninku
 *   - název, co slovník neumí anglický název se uživateli nikdy neukáže
 *   - klíč, který už existuje dvojí cvik pod jiným jménem
 *
 * O tom, jestli se cvik dostane do plánu, nakonec nerozhoduje tenhle soubor,
 * ale trigger enforce_exercise_registry_rules v databázi. Tady se řádek jen
 * připraví a zapíše.
 */
import { supabaseServer } from './supabaseServer.js';
import { nactiFrontu } from './exerciseImportQueue.js';
import { nazevCviku } from './exerciseNameCs.js';

export const ZDROJ_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const MEDIA_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

/** Kolik cviků smí jeden běh zapsat. Brzda proti tomu, aby se katalog zaplavil. */
export const IMPORT_MAX_PER_RUN = Number(process.env.EXERCISE_IMPORT_MAX_PER_RUN || 40);
/** Kolik objednávek se v jednom běhu obslouží. */
export const IMPORT_MAX_QUEUE_PER_RUN = Number(process.env.EXERCISE_IMPORT_MAX_QUEUE_PER_RUN || 12);

/** Vybavení zdroje → naše třídy. Co tu není, se neimportuje. */
const VYBAVENI_NA_TRIDU = Object.freeze({
  'body only': 'body_weight',
  dumbbell: 'dumbbell',
  barbell: 'barbell',
  cable: 'cable',
  machine: 'machine',
  kettlebells: 'kettlebell',
  bands: 'band',
  'e-z curl bar': 'barbell',
});

/** Partie zdroje → náš slovník. Co tu není, se neimportuje. */
const SVAL_NA_PARTII = Object.freeze({
  chest: 'chest',
  lats: 'back',
  'middle back': 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  abdominals: 'abs',
  glutes: 'glutes',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  calves: 'calves',
  'lower back': 'lower_back',
  traps: 'traps',
  forearms: 'forearms',
  abductors: 'abductors',
  adductors: 'adductors',
});

/** Protahování a strongman do týdenního plánu nepatří. */
const KATEGORIE_OK = new Set(['strength', 'plyometrics', 'cardio', 'powerlifting', 'olympic weightlifting']);

/** Klíč pro plánovač: musí projít regexem v bráně (^[a-z0-9_]{3,64}$). */
export function klicZNazvu(nazevEn) {
  return String(nazevEn || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
    .replace(/_+$/g, '');
}

/**
 * Stáhne dataset. Jediné síťové volání celého běhu.
 * @returns {Promise<Array<object>>}
 */
export async function stahniZdroj(fetchImpl = fetch) {
  const res = await fetchImpl(ZDROJ_URL);
  if (!res.ok) throw new Error(`free-exercise-db: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error('free-exercise-db: prázdný dataset');
  return data;
}

/**
 * Připraví řádek do registry, nebo řekne, proč cvik neprošel.
 *
 * @param {object} cvik surový záznam ze zdroje
 * @returns {{ radek: object } | { duvod: string }}
 */
export function pripravRadek(cvik) {
  const trida = VYBAVENI_NA_TRIDU[cvik?.equipment];
  if (!trida) return { duvod: `nezname_vybaveni:${cvik?.equipment ?? 'null'}` };

  if (!KATEGORIE_OK.has(cvik?.category)) return { duvod: `kategorie:${cvik?.category ?? 'null'}` };

  const partie = SVAL_NA_PARTII[(cvik?.primaryMuscles || [])[0]];
  if (!partie) return { duvod: `nezmapovana_partie:${(cvik?.primaryMuscles || [])[0] ?? 'null'}` };

  const obrazek = (cvik?.images || [])[0];
  if (!obrazek) return { duvod: 'bez_media' };

  const { nazev } = nazevCviku(cvik?.name);
  if (!nazev) return { duvod: 'nazev_neprelozitelny' };

  const klic = klicZNazvu(cvik?.name);
  if (!/^[a-z0-9_]{3,64}$/.test(klic)) return { duvod: 'spatny_klic' };

  return {
    radek: {
      canonical_key: klic,
      display_name_cs: nazev,
      exercisedb_name: cvik.name,
      image_url: `${MEDIA_URL}${obrazek}`,
      equipment: cvik.equipment,
      equipment_class: trida,
      primary_muscle: partie,
      target: (cvik.primaryMuscles || [])[0] ?? null,
      body_part: cvik.category ?? null,
      level: cvik.level ?? null,
      mechanic: cvik.mechanic ?? null,
      source: 'free-exercise-db',
      trust_level: 'exact',
      external_source: 'free-exercise-db',
      external_id: cvik.id,
    },
  };
}

/**
 * Jeden běh automatu.
 *
 * @param {{ dryRun?: boolean, queueId?: number|null }} [opts]
 */
export async function runExerciseImport(opts = {}, client = supabaseServer) {
  const dryRun = opts.dryRun === true;
  const vysledek = {
    dry_run: dryRun, objednavek: 0, zapsano: 0, preskoceno: 0,
    zahozeno: [], chyby: [], polozky: [],
  };

  const fronta = await nactiFrontu(IMPORT_MAX_QUEUE_PER_RUN, client, { queueId: opts.queueId ?? null });
  vysledek.objednavek = fronta.length;
  if (fronta.length === 0) {
    return { ...vysledek, skipped: true, reason: 'fronta je prázdná' };
  }

  const zdroj = await stahniZdroj();

  // Co už v katalogu je. Načítá se jednou — dotaz na každý cvik zvlášť by při
  // plné frontě znamenal stovky roundtripů.
  const { data: existujici, error: chybaCteni } = await client
    .from('exercise_asset_registry')
    .select('canonical_key, external_id');
  if (chybaCteni) throw new Error(`exercise_asset_registry: ${chybaCteni.message}`);

  const znameKlice = new Set((existujici || []).map((r) => r.canonical_key));
  const znameId = new Set((existujici || []).map((r) => r.external_id).filter(Boolean));

  const duvody = new Map();
  let zapsanoCelkem = 0;

  // Zdroj se zpracuje JEDNOU, ne pro každou objednávku znovu. Kromě zbytečné
  // práce to dřív kazilo i čísla: důvody zahození se násobily počtem
  // objednávek, takže log hlásil 2832 nepřeložitelných názvů místo 236.
  const poradiUrovni = { beginner: 0, intermediate: 1, expert: 2 };
  const pripravene = [];
  for (const cvik of zdroj) {
    if (znameId.has(cvik?.id)) continue;
    const r = pripravRadek(cvik);
    if (r.duvod) {
      duvody.set(r.duvod, (duvody.get(r.duvod) || 0) + 1);
      continue;
    }
    if (znameKlice.has(r.radek.canonical_key)) {
      duvody.set('klic_uz_existuje', (duvody.get('klic_uz_existuje') || 0) + 1);
      continue;
    }
    pripravene.push(r.radek);
  }

  // Začátečnické cviky napřed: katalog má nejdřív pokrýt to, co zvládne
  // každý, a teprve pak varianty pro pokročilé.
  pripravene.sort((a, b) => (poradiUrovni[a.level] ?? 3) - (poradiUrovni[b.level] ?? 3)
    || a.canonical_key.localeCompare(b.canonical_key));

  for (const objednavka of fronta) {
    if (zapsanoCelkem >= IMPORT_MAX_PER_RUN) {
      vysledek.preskoceno += 1;
      continue;
    }

    const kandidati = pripravene.filter((r) => r.equipment_class === objednavka.equipment_class
      && r.primary_muscle === objednavka.primary_muscle
      && !znameKlice.has(r.canonical_key));

    const kolik = Math.min(
      Number(objednavka.pozadovano) || 0,
      kandidati.length,
      IMPORT_MAX_PER_RUN - zapsanoCelkem,
    );
    const vybrane = kandidati.slice(0, kolik);

    const polozka = {
      queue_id: objednavka.id,
      equipment_class: objednavka.equipment_class,
      primary_muscle: objednavka.primary_muscle,
      pozadovano: objednavka.pozadovano,
      kandidatu: kandidati.length,
      zapsano: 0,
    };

    if (dryRun) {
      polozka.zapsano = vybrane.length;
      polozka.nahled = vybrane.map((r) => r.display_name_cs);
      vysledek.polozky.push(polozka);
      zapsanoCelkem += vybrane.length;
      continue;
    }

    if (vybrane.length > 0) {
      const { data: vlozene, error } = await client
        .from('exercise_asset_registry')
        .insert(vybrane)
        .select('canonical_key, external_id, usable_in_plan');

      if (error) {
        vysledek.chyby.push({ queue_id: objednavka.id, error: error.message });
        await client.from('exercise_import_queue').update({
          stav: 'failed', posledni_chyba: error.message,
          pokusu: (Number(objednavka.pokusu) || 0) + 1, updated_at: new Date().toISOString(),
        }).eq('id', objednavka.id);
        continue;
      }

      for (const r of vlozene || []) {
        znameKlice.add(r.canonical_key);
        if (r.external_id) znameId.add(r.external_id);
      }
      // Brána mohla řádek pustit dovnitř, ale nepovolit ho do plánu.
      polozka.zapsano = (vlozene || []).length;
      polozka.pouzitelnych = (vlozene || []).filter((r) => r.usable_in_plan).length;
      zapsanoCelkem += polozka.zapsano;
    }

    // Objednávka se uzavírá i tehdy, když zdroj nic nenabídl. Nechat ji
    // otevřenou by znamenalo zkoušet totéž každý den — a unikátní index by
    // navíc bránil založit ji znovu, až se zdroj rozšíří.
    const splneno = polozka.zapsano >= (Number(objednavka.pozadovano) || 0);
    await client.from('exercise_import_queue').update({
      stav: 'done',
      vyrobeno: polozka.zapsano,
      posledni_chyba: splneno ? null : `zdroj nabidl jen ${polozka.zapsano} z ${objednavka.pozadovano}`,
      pokusu: (Number(objednavka.pokusu) || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', objednavka.id);

    vysledek.polozky.push(polozka);
  }

  vysledek.zapsano = zapsanoCelkem;
  vysledek.zahozeno = [...duvody.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([duvod, pocet]) => ({ duvod, pocet }));

  return vysledek;
}
