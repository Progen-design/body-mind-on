import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const cache = JSON.parse(readFileSync('.cache/usda-ingredients.json', 'utf8'));
const src = readFileSync('scripts/fetch-usda-ingredients.mjs', 'utf8');
const b4 = [...src.matchAll(/^  \['([^']+)', '([^']+)', '([^']+)', 4\],$/gm)].map((m) => [m[1], m[2]]);

const norm = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

const overene = b4.filter(([cs]) => cache[cs]);
const mameNorm = new Set(overene.map(([cs]) => norm(cs)));

// Zdrojovy nazev z receptu -> cesky nazev ve slovniku.
const MAPA = {
  'swiss cheese': 'ementál', 'syr brie': 'brie', 'syr gouda prima donna': 'gouda',
  'syr gruyere': 'gruyère', 'jack cheese': 'monterey jack', 'monterey jack syr': 'monterey jack',
  'romano syr': 'pecorino romano', 'ostre americke syry': 'americký tavený sýr',
  'sou cream': 'zakysaná smetana', 'jogurt z plnotucneho mleka': 'plnotučný bílý jogurt',
  'non fat yogurt': 'netučný bílý jogurt', 'recky jogurt plnotucny': 'plnotučný řecký jogurt',
  'recky jogurt s vanilkou': 'vanilkový řecký jogurt', 'vanilla yogurt': 'vanilkový jogurt',
  'vanilla almond milk': 'vanilkové mandlové mléko', 'vanilla silk almond milk': 'vanilkové mandlové mléko',
  'maslo country crock': 'rostlinný tuk', 'veganske maslo': 'rostlinný tuk',
  'chorizo klobasa': 'chorizo', 'corned beef hash': 'hovězí hash',
  'liquid egg substitute': 'náhrada vajec', 'vajecny nahrazka': 'náhrada vajec',
  'baby arugula': 'rukola', 'baby beets': 'červená řepa',
  'mlade listy cervene repy': 'listy červené řepy', 'collard greens': 'listová kapusta collard',
  'parsnip': 'pastinák', 'watercress': 'řeřicha',
  'maslova dynova kase': 'máslová dýně vařená', 'mangosteen': 'mangostana',
  'maraschino tresen': 'koktejlové třešně', 'lime juice': 'limetková šťáva',
  'lime stava': 'limetková šťáva', 'coconut water': 'kokosová voda',
  'bread': 'chléb', 'grain bread': 'vícezrnný chléb', 'multigrain bread': 'vícezrnný chléb',
  'naan bread': 'naan', 'pita pockets': 'pita', 'pita chleb z celozrnne mouky': 'celozrnná pita',
  'croissanty': 'croissant', 'krutonky': 'krutony',
  'mleta kukuricna krupice': 'kukuřičná krupice',
  'nepecene testo na kolac': 'těsto na koláč', 'predpeceny korpus': 'těsto na koláč',
  'testo na quiche': 'těsto na koláč', 'pufovany ryzovy cerealie': 'pufovaná rýže',
  'barbecue sauce': 'barbecue omáčka', 'hoisin sauce': 'hoisin omáčka',
  'hot sauce': 'pálivá omáčka', 'ranch dressing': 'ranch dresink',
  'berry cranberry sauce': 'brusinková omáčka',
  'smetanova houbova polevka': 'houbová polévka', 'smetanova kureci polevka': 'kuřecí polévka',
  'miso paste': 'miso', 'refried fazole': 'fazolová kaše',
  'grape preserves': 'džem', 'raspberry fruit spread': 'džem',
  'mlety kardamom': 'kardamom', 'mlete hrebicek': 'hřebíček', 'tarragon leaves': 'estragon',
  'mleta horcice': 'hořčičný prášek', 'mlety horcicny prasek': 'hořčičný prášek',
  'trocha maku': 'mák', 'silna kava': 'káva',
};

const aliasy = [];
const vynechane = [];
for (const [zdroj, cil] of Object.entries(MAPA)) {
  if (mameNorm.has(norm(cil))) aliasy.push([zdroj, norm(cil)]);
  else vynechane.push([zdroj, cil]);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sqlSurovin = execSync('node scripts/fetch-usda-ingredients.mjs --batch=4 --sql', { encoding: 'utf8' })
  .split('\n').filter((l) => !l.startsWith('-- Vygenerováno') && !l.startsWith('-- Každý')
    && !l.startsWith('-- Ověřeno')).join('\n').trim();

const hlavicka = `-- Slovnik surovin, davka 4: hromadka "doplnit" z .cache/chybejici-suroviny-navrh.csv
--
-- MERENI, KTERE K TOMU VEDLO. Po kole 3 aliasu zbyva v aktivnich receptech 217
-- nepokrytych nazvu surovin, ktere blokuji 143 ze 433 aktivnich receptu. Z nich
-- bylo 149 vyhodnoceno jako surovina, ktera ve slovniku CHYBI CELA — alias by
-- u nich lhal o tuku nebo o zpracovani.
--
-- Hodnoty jsou z USDA FoodData Central pres scripts/fetch-usda-ingredients.mjs,
-- ke kazdemu radku patri FDC ID a presny nazev polozky. Nic se nedopocitava.
--
-- ZAPSANO ${overene.length} ze 149. Zbytek se nezapisuje ze dvou duvodu:
--   a) dotaz nejde polozit tak, aby jiste trefil tu surovinu (znackove vyrobky,
--      slozene pokrmy, prilis obecne nazvy) — vypsano v komentari ve skriptu
--   b) USDA vratilo JINOU surovinu a kontrola vystupu to zachytila:
--        syr asiago      -> Cheese spread, cream cheese base (7,1 g bilkovin misto ~25)
--        psenicna tortilla -> Puff pastry, frozen
--        kukuricna tortilla -> Puff pastry, frozen (stejne FDC ID)
--        reduced fat cheddar -> Cheese spread, reduced fat (13,4 g bilkovin misto ~28)
--        snizenotucna smetana -> Cream, fluid, LIGHT WHIPPING (30,9 g tuku)
--      a dohledat se nepodarilo: susene brusinky, guacamole
--
-- ALIASY NA KONCI. Nazvy v receptech jsou casto anglicke ("swiss cheese") nebo
-- jinak psane ("sou cream", "recky jogurt plnotucny"). Bez aliasu by nove
-- suroviny lezely ve slovniku a zadny recept by se neodblokoval. Alias miri
-- vzdycky na surovinu, ktera z prave te potraviny vznikla — nejde o mapovani
-- na neco podobneho, jako v kolech 1-3.

`;

const sqlAliasu = `

-- ---------------------------------------------------------------------------
-- Zruseni tri aliasu, ktere by nova data zastinily
--
-- Alias se v compute_nutrition_for_ingredients vyhodnocuje PRED slovnikem,
-- takze dokud tyhle tri existuji, novych radku se nikdo nedopta:
--
--   vanilkovy jogurt -> bily jogurt       61 kcal / 4,7 g S   vs  85 / 13,8 (skutecny vanilkovy)
--   limetkova stava  -> citronova stava   jiny citrus
--   chleb            -> celozrnny chleb   celozrnny vs bily
--
-- V kolech 1-3 to byla nejlepsi dostupna aproximace. Ted uz mame presnou
-- surovinu z USDA, takze aproximace prekazi.
-- ---------------------------------------------------------------------------
DELETE FROM public.ingredient_aliases
WHERE alias_normalized IN ('vanilkovy jogurt', 'limetkova stava', 'chleb');

-- ---------------------------------------------------------------------------
-- Aliasy: podoby nazvu z receptu -> nove suroviny (${aliasy.length})
-- ---------------------------------------------------------------------------
INSERT INTO ingredient_aliases (alias_normalized, canonical_normalized, display_alias_cs)
SELECT v.a, v.c, v.a
FROM (VALUES
${aliasy.sort((x, y) => x[0].localeCompare(y[0])).map(([a, c]) => `  (${q(a)},${q(c)})`).join(',\n')}
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

writeFileSync('supabase/migrations/20260804120000_usda_ingredients_batch4.sql',
  hlavicka + sqlSurovin + sqlAliasu);
console.log(`surovin: ${overene.length}, aliasu: ${aliasy.length}`);
if (vynechane.length) console.log('alias vynechan (cil se nestahl):', vynechane.map(([a, c]) => `${a}->${c}`).join(', '));
