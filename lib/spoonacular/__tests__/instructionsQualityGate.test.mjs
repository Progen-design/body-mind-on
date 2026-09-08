/**
 * evaluateInstructionsQualityGate() — tenký obal nad posudPostup() pro
 * catalogTranslate.js (spoonacular) a zapisRecept() (llm_generated).
 *
 * Druhé kolo opravy laťky (9. 9. 2026, viz lib/plan/kvalitaPostupu.js):
 * `pass` se řídí VÝHRADNĚ blokujícími pravidly. `varovani` se vrací navíc
 * k zalogování, ale nikdy nesmí ovlivnit `pass`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateInstructionsQualityGate } from '../catalogImportGate.js';

test('pass === false jen na blokujícím důvodu (míň než 4 kroky)', () => {
  const g = evaluateInstructionsQualityGate({
    nazev: 'Test',
    suroviny: ['brambory'],
    kroky: ['Osol maso.', 'Opeč maso.'],
  });
  assert.equal(g.pass, false);
  assert.equal(g.reason, 'weak_instructions');
  assert.ok(g.duvody.length > 0);
});

test('varování (surovina mimo ingredients, tepelná úprava bez teploty) NESMÍ srazit pass na false', () => {
  const g = evaluateInstructionsQualityGate({
    nazev: 'Kuře s bramborem',
    suroviny: ['kuřecí prsa', 'brambory'],
    kroky: [
      'Brambory oloupej a nakrájej na kostky 2 cm.',
      'Vlož brambory do osolené vody a vař 15 minut.',
      'Kuřecí prsa osol a zalij smetanou, poté opeč.',
      'Brambory sceď a podávej s kuřecím prsem na talíři.',
    ],
  });
  assert.equal(g.pass, true);
  assert.equal(g.reason, null);
  assert.deepEqual(g.duvody, []);
  assert.ok(g.varovani.length > 0, 'smetana mimo ingredients a opeč bez teploty/času musí zůstat aspoň jako varování');
});
