/**
 * lib/exerciseVariantAudit.js
 *
 * Čistá logika pro `scripts/verify-varianty-cviku.mjs` (PROMPT_PRO_CODE.md
 * bod B) — vytažená sem, aby šla otestovat na fixture datech bez DB, stejně
 * jako `sestavVariantuCviku` v `lib/planExerciseVariantBuilder.js`.
 *
 * Bere řádky `exercise_asset_registry` (canonical_key, display_name_cs,
 * level, easier_key, harder_key, primary_muscle, equipment_class) a najde
 * podezřelé páry lehčí/těžší varianty. Nic tu nezapisuje a nic nenavrhuje —
 * jen hlásí.
 *
 * PROČ HARD FAIL = jen neshoda primary_muscle + strukturální integrita:
 *  - primary_muscle je čistý enum se 100% pokrytím, nezávislý na `level`
 *    (o kterém víme, že je nespolehlivý zdroj — barbell_squat = beginner,
 *    goblet_squat = intermediate). Neshoda u ~24 % párů je vzácná a silná.
 *  - Strukturální rozbití (odkaz na neexistující cvik, self-reference,
 *    stejný cíl pro easier i harder, cyklus) je objektivně rozbité bez
 *    ohledu na obsahovou kvalitu párování.
 *
 * PROČ level logika a (a)symetrie jsou JEN report:
 *  - Level logiku porušuje 284 z 370 párů (77 %) — brána, kterou neprojde
 *    většina dat, nic nehlídá, a navíc je to srovnání podle sloupce, o
 *    kterém víme, že je nekvalitní. Bereme to jako důkaz vzniku párů
 *    (bucketování podle levelu), ne jako cíl.
 *  - Vzájemná symetrie A.easier=B, B.harder≠A neplatí ani logicky — B může
 *    mít lepší harder variantu než A, aniž by to byla chyba (202/370, 55 %).
 *  - equipment_class se u progrese mění u 94–96 % párů i legitimně
 *    (dumbbell -> barbell), takže samostatně nic neříká.
 */

export const FAN_IN_THRESHOLD = 4;
export const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 };
export const SMER_POPIS = { easier_key: 'lehčí', harder_key: 'těžší' };

/** @param {object|null} row */
export function popisCviku(row) {
  if (!row) return '(neznámý klíč)';
  return `${row.canonical_key} „${row.display_name_cs || '—'}“ [partie: ${row.primary_muscle || '—'}, vybavení: ${row.equipment_class || '—'}, level: ${row.level || '—'}]`;
}

/**
 * Cykly v grafu easier_key/harder_key. Každý cvik má nejvýš jeden odkaz
 * v daném směru (funkční graf), takže stačí projít každý řetězec jednou
 * a hlídat, jestli se vrátíme na uzel z ROZJETÉ cesty (ne z už uzavřené).
 * Self-loop (délka 1) se hlásí zvlášť ve `strukturalniIntegrita` — sem
 * patří jen skutečné vícenode cykly.
 *
 * @param {object[]} rows
 * @param {Map<string, object>} byKey
 * @param {'easier_key'|'harder_key'} pole
 * @returns {string[][]}
 */
export function najdiCykly(rows, byKey, pole) {
  const stav = new Map(); // 1 = na aktuální cestě, 2 = hotovo
  const cykly = [];
  for (const start of rows) {
    if (stav.get(start.canonical_key) === 2) continue;
    const cesta = [];
    let aktualni = start.canonical_key;
    while (aktualni && byKey.has(aktualni) && stav.get(aktualni) !== 2) {
      if (stav.get(aktualni) === 1) {
        const idx = cesta.indexOf(aktualni);
        if (idx > -1 && cesta.length - idx > 1) cykly.push(cesta.slice(idx));
        break;
      }
      stav.set(aktualni, 1);
      cesta.push(aktualni);
      aktualni = byKey.get(aktualni)[pole];
    }
    for (const k of cesta) stav.set(k, 2);
  }
  return cykly;
}

/** @param {object[]} rows */
export function strukturalniIntegrita(rows, byKey) {
  const nalezy = [];
  for (const row of rows) {
    for (const pole of ['easier_key', 'harder_key']) {
      const cil = row[pole];
      if (!cil) continue;
      if (!byKey.has(cil)) {
        nalezy.push(`${popisCviku(row)}: .${pole} -> "${cil}" v registru neexistuje`);
      } else if (cil === row.canonical_key) {
        nalezy.push(`${popisCviku(row)}: .${pole} ukazuje sám na sebe`);
      }
    }
    if (row.easier_key && row.harder_key && row.easier_key === row.harder_key) {
      nalezy.push(`${popisCviku(row)}: easier_key i harder_key vede na stejný cvik (${row.easier_key})`);
    }
  }
  for (const pole of ['easier_key', 'harder_key']) {
    for (const cyklus of najdiCykly(rows, byKey, pole)) {
      nalezy.push(`cyklus v .${pole}: ${cyklus.join(' -> ')} -> ${cyklus[0]}`);
    }
  }
  return nalezy;
}

/**
 * Projde všechny páry (easier_key + harder_key) a spočítá pro každý VŠECHNY
 * signály najednou — hard i report-only dohromady, ať jde report seřadit
 * podle toho, kolik signálů se sešlo.
 *
 * @param {object[]} rows
 * @param {Map<string, object>} byKey
 */
export function analyzujPary(rows, byKey) {
  const pary = [];
  for (const row of rows) {
    for (const pole of ['easier_key', 'harder_key']) {
      const cilKlic = row[pole];
      if (!cilKlic) continue;
      const cil = byKey.get(cilKlic);
      if (!cil) continue; // už nahlášeno jako strukturální nález

      const smer = SMER_POPIS[pole];
      const neshodaPartie = !!(row.primary_muscle && cil.primary_muscle && row.primary_muscle !== cil.primary_muscle);

      const rankOd = LEVEL_RANK[row.level];
      const rankNa = LEVEL_RANK[cil.level];
      const poruseniLevelu = rankOd == null || rankNa == null
        ? null // nelze posoudit, level chybí
        : pole === 'easier_key' ? rankNa >= rankOd : rankNa <= rankOd;

      const reciprocniPole = pole === 'easier_key' ? 'harder_key' : 'easier_key';
      const asymetricke = cil[reciprocniPole] !== row.canonical_key;

      pary.push({
        row, cil, pole, smer, neshodaPartie,
        poruseniLevelu: !!poruseniLevelu,
        levelNelzePosoudit: poruseniLevelu === null,
        asymetricke,
        reciprocniPole,
        reciprocniSkutecnost: cil[reciprocniPole] || '(prázdné)',
      });
    }
  }
  return pary;
}

/** Víc sešlých report-only signálů = výš v pořadí, pak abecedně. */
export function pocetSkore(p) {
  return (p.poruseniLevelu ? 1 : 0) + (p.asymetricke ? 1 : 0);
}
export function serazenoSkore(a, b) {
  return (pocetSkore(b) - pocetSkore(a)) || a.row.canonical_key.localeCompare(b.row.canonical_key);
}

/**
 * Kolikrát je klíč použit jako cíl (easier_key/harder_key), a napříč kolika
 * partiemi zdrojových cviků — vysoký fan-in přes RŮZNÉ partie je otisk
 * bucketování podle levelu, ne kurace podle pohybu.
 *
 * @param {object[]} rows
 * @param {Map<string, object>} byKey
 * @param {number} threshold
 */
export function analyzujFanIn(rows, byKey, threshold = FAN_IN_THRESHOLD) {
  const cileMap = new Map(); // klic -> { easier_key: [rows], harder_key: [rows] }
  for (const row of rows) {
    for (const pole of ['easier_key', 'harder_key']) {
      const cil = row[pole];
      if (!cil || !byKey.has(cil)) continue;
      const bucket = cileMap.get(cil) || { easier_key: [], harder_key: [] };
      bucket[pole].push(row);
      cileMap.set(cil, bucket);
    }
  }
  const fanIn = [];
  for (const [cilKlic, bucket] of cileMap) {
    for (const pole of ['easier_key', 'harder_key']) {
      const zdroje = bucket[pole];
      if (zdroje.length < threshold) continue;
      const partie = [...new Set(zdroje.map((z) => z.primary_muscle).filter(Boolean))];
      fanIn.push({ cilKlic, cil: byKey.get(cilKlic), pole, smer: SMER_POPIS[pole], zdroje, partie });
    }
  }
  fanIn.sort((a, b) => (b.partie.length - a.partie.length) || (b.zdroje.length - a.zdroje.length));
  return fanIn;
}

/**
 * Kompletní analýza nad řádky registru — jediný vstupní bod pro skript i
 * pro testy.
 *
 * @param {object[]} rows
 * @param {{ fanInThreshold?: number }} [opts]
 */
export function analyzujVarianty(rows, opts = {}) {
  const fanInThreshold = opts.fanInThreshold ?? FAN_IN_THRESHOLD;
  const byKey = new Map(rows.map((r) => [r.canonical_key, r]));

  const strukturalni = strukturalniIntegrita(rows, byKey);
  const pary = analyzujPary(rows, byKey);

  const tvrdeParyMuscle = pary.filter((p) => p.neshodaPartie).sort(serazenoSkore);
  const reportOnlyPary = pary
    .filter((p) => !p.neshodaPartie && (p.poruseniLevelu || p.asymetricke))
    .sort(serazenoSkore);

  const celkemParu = pary.length;
  const levelPosouditelnych = pary.filter((p) => !p.levelNelzePosoudit).length;
  const levelPoruseni = pary.filter((p) => p.poruseniLevelu).length;
  const asymetrickych = pary.filter((p) => p.asymetricke).length;

  const fanIn = analyzujFanIn(rows, byKey, fanInThreshold);
  const fanInNapricPartiemi = fanIn.filter((f) => f.partie.length > 1);

  return {
    byKey, pary, strukturalni, tvrdeParyMuscle, reportOnlyPary,
    celkemParu, levelPosouditelnych, levelPoruseni, asymetrickych,
    fanIn, fanInNapricPartiemi, fanInThreshold,
  };
}
