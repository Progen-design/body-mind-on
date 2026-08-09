#!/usr/bin/env node
/**
 * Kolik kandidátů katalog nabídne na jeden slot — proti produkci.
 *
 *   node scripts/verify-catalog-candidate-supply.mjs
 *
 * PROČ. Do 9. 8. 2026 filtroval `fetchCatalogCandidates` v SQL přímo na cíl
 * slotu ±15 %. Recept se ale do pásma dostane až naškálováním porce, takže se
 * zahazovalo všechno, co by po naškálování sedlo. U snídaně s cílem ~500 kcal
 * to nechalo 3 kandidáty (po diverzitních vyloučeních) z 117, které v pásmu
 * slotu existují — a plán pak všem servíroval totéž jídlo.
 *
 * Tenhle skript měří obě varianty proti sobě, aby bylo vidět, že okno opravdu
 * pustí dál to, co má. Hranice škálování se IMPORTUJÍ z portionScaling, aby se
 * nemohly rozejít; SQL okno se počítá stejným vzorcem jako ve fetchi.
 *
 * Prahy: každý slot musí nabídnout aspoň MIN_KANDIDATU kandidátů.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { MIN_SCALE, MAX_SCALE } from '../lib/nutrition/portionScaling.js';

function loadEnvLocal() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, '.env.local');
  if (!existsSync(file)) return;
  for (const radek of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = radek.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m || radek.trim().startsWith('#')) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
}
loadEnvLocal();

const MIN_KANDIDATU = 20;

/** Slotová pásma (calorieRangeForMealType) a typické cíle slotu. */
const SLOTY = [
  { slot: 'snidane', slotMin: 300, slotMax: 550, cil: 500 },
  { slot: 'obed', slotMin: 450, slotMax: 700, cil: 600 },
  { slot: 'vecere', slotMin: 450, slotMax: 700, cil: 550 },
  { slot: 'svacina', slotMin: 150, slotMax: 320, cil: 250 },
];

/** Cíl slotu ±15 %, zaříznuté slotovým pásmem — stejně jako kcalBandForMealSlot. */
function cilovePasmo({ slotMin, slotMax, cil }) {
  const lo = Math.max(slotMin, Math.round(cil * 0.85));
  const hi = Math.min(slotMax, Math.round(cil * 1.15));
  return lo <= hi ? { min: lo, max: hi } : { min: slotMin, max: slotMax };
}

/** Stejný clamp jako clampedPortionMultiplier bez simple-start režimu. */
function nasobek(base, cil) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, cil / base));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Chybi NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  let selhani = 0;
  console.log(`Prah: aspon ${MIN_KANDIDATU} kandidatu na slot. Skalovani ${MIN_SCALE}–${MAX_SCALE}x.\n`);

  for (const s of SLOTY) {
    const pasmo = cilovePasmo(s);
    // SQL okno: co se do pasma da naskalovat.
    const sqlMin = Math.max(80, Math.floor(pasmo.min / MAX_SCALE));
    const sqlMax = Math.ceil(pasmo.max / MIN_SCALE);

    const { data, error } = await db
      .from('recipes_catalog')
      .select('id, kcal')
      .eq('active', true)
      .eq('meal_type', s.slot)
      .gte('kcal', sqlMin)
      .lte('kcal', sqlMax)
      .limit(500);
    if (error) throw new Error(`${s.slot}: ${error.message}`);

    // Stary stav: SQL filtr rovnou na cilove pasmo.
    const { count: stare, error: e2 } = await db
      .from('recipes_catalog')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .eq('meal_type', s.slot)
      .gte('kcal', pasmo.min)
      .lte('kcal', pasmo.max);
    if (e2) throw new Error(`${s.slot}: ${e2.message}`);

    // Kontrola PO naskalovani porce.
    const nove = (data || []).filter((r) => {
      const base = Number(r.kcal);
      if (!Number.isFinite(base) || base <= 0) return false;
      const naservirovano = base * nasobek(base, s.cil);
      return naservirovano >= pasmo.min - 0.5 && naservirovano <= pasmo.max + 0.5;
    }).length;

    const ok = nove >= MIN_KANDIDATU;
    if (!ok) selhani += 1;
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${s.slot.padEnd(9)} cil ${String(s.cil).padStart(4)} kcal | `
      + `cilove pasmo ${pasmo.min}-${pasmo.max} | SQL okno ${sqlMin}-${sqlMax} | `
      + `stare ${String(stare).padStart(3)} -> nove ${String(nove).padStart(3)} kandidatu`
    );
  }

  console.log(`\nRESULT: ${selhani === 0 ? 'PASS' : `FAIL (${selhani} slotu pod prahem)`}`);
  process.exit(selhani === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
