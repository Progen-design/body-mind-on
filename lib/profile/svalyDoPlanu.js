/**
 * SVALOVÉ SKUPINY A NÁŘADÍ DO ULOŽENÉHO PLÁNU.
 *
 * PROČ. `structured_plan_json` nese u každého cviku `canonical_key`, `sets`
 * a `reps`, ale nic o tom, co ten cvik zabírá. UI proto ukazovalo „Trénink B"
 * a pod tím „Fokus: Varianta B" — název opsaný jinými slovy. Člověk, který
 * si plán otevře poprvé, z toho nepozná, co bude cvičit, ani proč se A a B
 * střídají.
 *
 * Přitom `exercise_asset_registry` má u každého cviku `primary_muscle`
 * i `equipment_class`. Změřeno 23. 8. 2026: všech deset cviků v aktivním
 * plánu se páruje na registr a všech deset tam svalovou skupinu má.
 *
 * Dopárování se dělá tady, při čtení profilu — ne v generátoru, aby popis
 * dostaly i plány vygenerované dřív. Stejný vzor jako `postupyDoPlanu.js`.
 *
 * CO TENHLE MODUL NEDĚLÁ: nehádá svalovou skupinu z názvu cviku. Když se
 * cvik na registr nenapáruje, zůstane bez popisu a UI ho do souhrnu
 * nezapočítá — radši méně informace než vymyšlená.
 *
 * MODUL JE ČISTÝ — bez importů, kvůli `node --test` bez transpilace.
 */

/**
 * Sloupce registru, které tenhle modul čte.
 *
 * Jediný zdroj pravdy pro `.select()` v `api/profile.js`. Kdyby se seznam
 * psal na dvou místech, rozešel by se tiše — server by přestal vozit
 * `equipment_class`, řádek s nářadím by nikdy nesvítil a žádný test jedné
 * strany by to nezachytil.
 *
 * `instructions_cs` (docs/DALSI_KROK.md 9.9): kroky provedení cviku, JEDINÝ
 * sloupec postupu, který jde do UI — anglický otisk `instructions_en` se
 * uživateli nikdy neukazuje, proto se sem ani nenačítá.
 *
 * `level`/`easier_key`/`harder_key`: obtížnost a lehčí/těžší varianta cviku.
 * Stejný princip jako postup — dopárovává se při čtení, aby ho dostaly
 * i plány vygenerované předtím, než tahle pole vůbec existovala.
 */
export const SLOUPCE_REGISTRU_PRO_SVALY =
  'canonical_key, display_name_cs, primary_muscle, equipment_class, instructions_cs, level, mechanic, easier_key, harder_key, gif_url, image_url, wger_exercise_image_url';

/** level (beginner/intermediate/expert) -> český popisek obtížnosti pro UI. */
const OBTIZNOST_PODLE_UROVNE = { beginner: 'lehké', intermediate: 'střední', expert: 'těžké' };

/** Dny plánu, ať už jsou uložené kdekoli. */
function dnyPlanu(plan) {
  const dny = plan?.structured_plan_json?.days;
  return Array.isArray(dny) ? dny : [];
}

/** Cviky jednoho dne. */
function cvikyDne(den) {
  const cviky = den?.workout?.exercises;
  return Array.isArray(cviky) ? cviky : [];
}

/**
 * Klíče všech cviků ve všech plánech, bez duplicit.
 *
 * @param {Array<object>} plany
 * @returns {string[]}
 */
export function kliceCviku(plany = []) {
  const klice = new Set();
  for (const plan of Array.isArray(plany) ? plany : []) {
    for (const den of dnyPlanu(plan)) {
      for (const cvik of cvikyDne(den)) {
        const klic = String(cvik?.canonical_key || '').trim();
        if (klic) klice.add(klic);
      }
    }
  }
  return [...klice];
}

/**
 * Doplní do cviků `primary_muscle`, `equipment_class`, `instructions_cs`,
 * obtížnost (`level`/`obtiznost`) a lehčí/těžší variantu z registru.
 *
 * Mutuje kopii plánu, originál nechává být. Cvik, který v registru není,
 * projde beze změny. Prázdný postup se nepropisuje — UI pak nekreslí nic,
 * žádné „Postup není k dispozici" (docs/DALSI_KROK.md 9.9). Varianta
 * (easier_key/harder_key) se propíše, jen když k ní `nazevPodleKlice` má
 * český název — jinak by tlačítko ve WorkoutSection ukazovalo klíč bez
 * popisku, nebo mířilo na cvik, který se nedá zobrazit.
 *
 * @param {Array<object>} plany plány z databáze
 * @param {Array<{canonical_key: string, primary_muscle?: string, equipment_class?: string, instructions_cs?: string[]|null, level?: string|null, easier_key?: string|null, harder_key?: string|null}>} radkyRegistru
 * @param {Map<string, string>} [nazevPodleKlice] canonical_key -> display_name_cs,
 *   pro cviky V PLÁNU i pro jejich varianty (easier_key/harder_key), které
 *   samy v plánu být nemusí — volající (api/profile.js) to sestaví druhou
 *   dávkou, stejným vzorem jako lib/services/planOrchestratorResolve.js.
 * @returns {Array<object>} plány s obohacenými cviky
 */
export function doplnSvalyDoPlanu(plany = [], radkyRegistru = [], nazevPodleKlice = new Map()) {
  const podleKlice = new Map();
  for (const radek of Array.isArray(radkyRegistru) ? radkyRegistru : []) {
    const klic = String(radek?.canonical_key || '').trim();
    if (klic) podleKlice.set(klic, radek);
  }
  if (podleKlice.size === 0) return plany;

  const nazev = nazevPodleKlice instanceof Map ? nazevPodleKlice : new Map();

  return (Array.isArray(plany) ? plany : []).map((plan) => {
    const dny = dnyPlanu(plan);
    if (!dny.length) return plan;

    const noveDny = dny.map((den) => {
      const cviky = cvikyDne(den);
      if (!cviky.length) return den;

      const noveCviky = cviky.map((cvik) => {
        const radek = podleKlice.get(String(cvik?.canonical_key || '').trim());
        if (!radek) return cvik;

        const easierNazev = radek.easier_key ? String(nazev.get(radek.easier_key) || '').trim() : '';
        const harderNazev = radek.harder_key ? String(nazev.get(radek.harder_key) || '').trim() : '';

        // MÉDIUM BERE REGISTR, NE ULOŽENÝ PLÁN. Snímek uložený do
        // structured_plan_json v den generování v plánu zůstane i poté, co
        // se v katalogu opraví — přesně tak uživatel u „Tlaky s
        // jednoručkami" viděl ještě po opravě katalogu vadný obrázek
        // gluteálního mostu (migrace 20260908160000). Registr je zdroj
        // pravdy: když řádek existuje, jeho médium přebíjí to v plánu,
        // včetně případu, kdy registr žádné nemá — pak se nekreslí nic.
        const gifZRegistru = radek.gif_url || null;
        const obrazekZRegistru = radek.image_url || radek.wger_exercise_image_url || null;

        return {
          ...cvik,
          gif_url: gifZRegistru,
          image_url: obrazekZRegistru,
          primary_muscle: radek.primary_muscle ?? cvik.primary_muscle ?? null,
          equipment_class: radek.equipment_class ?? cvik.equipment_class ?? null,
          instructions_cs: Array.isArray(radek.instructions_cs) && radek.instructions_cs.length > 0
            ? radek.instructions_cs
            : cvik.instructions_cs ?? null,
          level: radek.level ?? cvik.level ?? null,
          obtiznost: OBTIZNOST_PODLE_UROVNE[radek.level] ?? cvik.obtiznost ?? null,
          easier_key: easierNazev ? radek.easier_key : (cvik.easier_key ?? null),
          easier_display_name_cs: easierNazev || (cvik.easier_display_name_cs ?? null),
          harder_key: harderNazev ? radek.harder_key : (cvik.harder_key ?? null),
          harder_display_name_cs: harderNazev || (cvik.harder_display_name_cs ?? null),
        };
      });

      return { ...den, workout: { ...den.workout, exercises: noveCviky } };
    });

    return {
      ...plan,
      structured_plan_json: { ...plan.structured_plan_json, days: noveDny },
    };
  });
}
