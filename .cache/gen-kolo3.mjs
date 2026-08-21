import { readFileSync, writeFileSync } from 'fs';

const prosly = JSON.parse(readFileSync('.cache/aliasy-kolo3b-prosly.json', 'utf8'));
const neprosly = JSON.parse(readFileSync('.cache/aliasy-kolo3b-neprosly.json', 'utf8'));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const radky = Object.entries(prosly).sort(([a], [b]) => a.localeCompare(b))
  .map(([a, v]) => `  (${q(a)},${q(v.cil)})`).join(',\n');

let h = `-- Aliasy surovin, kolo 3: anglicke nazvy a znackove varianty z importu.
--
-- MERENI, KTERE K TOMU VEDLO. Po kolech 1 a 2 (297 aliasu) zbyva v aktivnich
-- receptech 297 nepokrytych nazvu surovin, ktere blokuji 162 ze 433 aktivnich
-- receptu. Z nich bylo 90 vyhodnoceno jako jednoznacny alias na surovinu, ktera
-- uz ve slovniku je — vetsinou anglicke nazvy ze Spoonacularu (olive oil,
-- garlic, flour) a znackove varianty (Chobani yogurt, Bel Gioioso mozzarella).
--
-- Vsech 90 proslo branou scripts/verify-ingredient-aliases.mjs, ktera pro kazdy
-- alias prepocita zasazene aktivni recepty pres compute_nutrition_for_ingredients
-- a porovna vysledek s ulozenymi kcal. PROSLO ${Object.keys(prosly).length}, NEPROSLO ${Object.keys(neprosly).length}.
--
-- OPRAVA BRANY, KTERA U TOHOHLE KOLA VZNIKLA. Brana puvodne soudila alias podle
-- celkove chyby receptu. To shodilo "olive oil", "garlic", "butter" i "parsley"
-- se shodnou odchylkou 50,5 %, protoze vsechny ctyri mely jediny meritelny
-- recept — #651 alfredo omacku, kde ulozenych 501 kcal nesedi se 754 kcal ze
-- surovin. Cesnek za ten rozdil nemuze; prispiva do receptu jednotkami kalorii.
-- Brana proto nove meri PRISPEVEK aliasu do receptu a recepty, kde alias vazi
-- min nez 10 % ulozenych kcal, z hodnoceni vyrazuje jako nevypovidajici.
-- Po oprave prosly navic: garlic, parsley, kosher salt, soja omacka.
--
-- NEPROSLO ${Object.keys(neprosly).length} a zamerne se NEZAPISUJI:
`;

for (const [a, v] of Object.entries(neprosly).sort(([x], [y]) => x.localeCompare(y))) {
  h += `--   ${a.padEnd(32)} -> ${String(v.cil).padEnd(20)} ${v.duvod}\n`;
}

h += `--
-- U "olive oil" a "butter" je jazykovy vyznam jisty, ale do alfreda #651
-- kalorie realne prispivaji, takze ten recept o nich vypovida — a nesedi.
-- Dokud nevime, jestli je spatne ulozena hodnota nebo nase cislo za olej,
-- alias nezapisujeme. Cisla jsou v .cache/aliasy-kolo3b-neprosly.json.

INSERT INTO ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
SELECT v.a, v.c, v.a
FROM (VALUES
${radky}
) AS v(a, c)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kontrola: zadny alias nesmi mirit do prazdna.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_slepych integer;
BEGIN
  SELECT count(*) INTO v_slepych
  FROM public.ingredient_aliases a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ingredients_nutrition i
    WHERE lower(extensions.unaccent(i.name_cs)) = a.canonical_normalized
  )
  AND NOT public.is_pantry_ingredient(a.canonical_normalized);

  IF v_slepych <> 0 THEN
    RAISE EXCEPTION 'Aliasu miricich do prazdna je %, cekali jsme 0.', v_slepych;
  END IF;
END $$;
`;

writeFileSync('supabase/migrations/20260804080000_ingredient_aliases_round3.sql', h);
console.log(`zapsano ${Object.keys(prosly).length} aliasu do migrace`);
