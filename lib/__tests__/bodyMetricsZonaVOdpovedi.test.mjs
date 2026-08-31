/**
 * BODY_METRICS.CREATED_AT MUSÍ MÍT V ODPOVĚDI ZÓNU, I KDYŽ JI SLOUPEC NEMÁ.
 *
 * docs/DALSI_KROK.md 6.10. Migrace na timestamptz na produkci nejde — ALTER
 * padá na `rule _RETURN on view system_health_alerts_zaklad depends on
 * column "created_at"` (watchdog `calorie_target_mismatch` na sloupci řadí).
 * Zónu proto doplňuje api/profile.js při serializaci odpovědi
 * (`bodyMetricsSeZonou`), ne migrace — klientský fallback `naVazeni()`
 * (src/data/adaptery.ts) jinak řádek bez zóny zahodí (`maCasovouZonu`,
 * docs/DALSI_KROK.md 6.6) a graf váhy zůstane prázdný.
 *
 * Test kryje čistou logiku bez DB — api/profile.js importuje
 * supabaseServer.js a další moduly se side-effecty, které bez env
 * proměnných nejdou spustit celé. Funkce `bodyMetricsSeZonou` je ale čistá
 * (bere pole, vrací pole), takže se dá z reálného zdroje vytáhnout a spustit
 * samostatně — stejný duch jako textová kontrola v
 * lib/__tests__/invalidHabitIds.test.mjs, jen ověřuje i skutečné chování,
 * ne jen přítomnost volání.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const zdroj = fs.readFileSync(new URL('../../api/profile.js', import.meta.url), 'utf8');

test('odpověď posílá body_metrics obalené přes bodyMetricsSeZonou, ne syrová', () => {
  const indexFunkce = zdroj.indexOf('function bodyMetricsSeZonou(');
  const indexPouziti = zdroj.indexOf('bodyMetricsProKlienta = bodyMetricsSeZonou(bodyMetrics)');
  const indexPayload = zdroj.indexOf('body_metrics: bodyMetricsProKlienta,');

  assert.ok(indexFunkce > -1, 'api/profile.js nedefinuje bodyMetricsSeZonou');
  assert.ok(indexPouziti > indexFunkce, 'bodyMetricsProKlienta se nepočítá přes bodyMetricsSeZonou(bodyMetrics)');
  assert.ok(indexPayload > indexPouziti, 'odpověď nepoužívá bodyMetricsProKlienta pro pole body_metrics');
});

test('bodyMetricsSeZonou doplní Z jen tam, kde zóna chybí, a nepřepočítává čas', () => {
  const shoda = zdroj.match(/function bodyMetricsSeZonou\(bodyMetrics\) \{[\s\S]*?\n\}/);
  assert.ok(shoda, 'tělo bodyMetricsSeZonou se z api/profile.js nepodařilo vytáhnout vcelku');

  // eslint-disable-next-line no-new-func -- spouští se skutečné tělo funkce ze zdroje, ne kopie
  const bodyMetricsSeZonou = new Function(`${shoda[0]}\nreturn bodyMetricsSeZonou;`)();

  const vstup = [
    // Přesně produkční tvar (docs/DALSI_KROK.md 6.10): bez zóny.
    { id: 'a', created_at: '2026-08-31T00:03:59.275', weight_kg: 104.6 },
    // Zóna už tam náhodou je — nesmí se zdvojit.
    { id: 'b', created_at: '2026-08-31T00:03:59.275Z', weight_kg: 99 },
    { id: 'c', created_at: '2026-08-31T02:03:59.275+02:00', weight_kg: 98 },
    // Chybějící/neřetězcové datum nesmí spadnout.
    { id: 'd', created_at: null, weight_kg: 97 },
  ];

  const vystup = bodyMetricsSeZonou(vstup);

  assert.equal(vystup[0].created_at, '2026-08-31T00:03:59.275Z', 'chybějící zóna se má jen přilepit, ne přepočítat');
  assert.equal(vystup[1].created_at, '2026-08-31T00:03:59.275Z', 'existující Z se nesmí zdvojit');
  assert.equal(vystup[2].created_at, '2026-08-31T02:03:59.275+02:00', 'existující offset se nesmí přepsat');
  assert.equal(vystup[3].created_at, null, 'chybějící datum nesmí funkci spadnout');

  // Ostatní pole řádku zůstávají beze změny — mění se jen created_at.
  assert.equal(vystup[0].weight_kg, 104.6);
  assert.equal(vystup[0].id, 'a');
});

test('bodyMetricsSeZonou nesahá na interní bodyMetrics použité jinde v handleru', () => {
  // Výška, datum narození a historie vah čtou syrové `bodyMetrics` (Node na
  // Vercelu běží v UTC, takže tam na zóně v řetězci nezáleží) — jen pole
  // v odpovědi pro klienta smí jít přes bodyMetricsSeZonou.
  assert.match(
    zdroj,
    /for \(const row of bodyMetrics\)/,
    'birthDateFromMetrics má dál číst syrové bodyMetrics'
  );
  assert.match(
    zdroj,
    /sestavHistoriiVah\(bodyMetrics, bodyMeasurements\)/,
    'weightHistory má dál čítat syrové bodyMetrics'
  );
});
