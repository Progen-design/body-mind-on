import test from 'node:test';
import assert from 'node:assert/strict';
import { booleanParam, booleanParamRequired } from '../httpParams.js';

// Regrese: z.coerce.boolean() dělá Boolean("false") === true, takže
// ?dry_run=false spouštěl dry run a {"approve":"false"} recept schvaloval.

test('"false" z query stringu je false, ne true', () => {
  assert.equal(booleanParam(false).parse('false'), false);
  assert.equal(booleanParam(true).parse('false'), false);
  assert.equal(booleanParamRequired().parse('false'), false);
});

test('pravdivé zápisy projdou', () => {
  for (const v of ['true', 'TRUE', ' true ', '1', 'yes', 'ano', 'on', true, 1]) {
    assert.equal(booleanParam(false).parse(v), true, `selhalo pro ${JSON.stringify(v)}`);
  }
});

test('nepravdivé zápisy neprojdou', () => {
  for (const v of ['0', 'no', 'ne', 'off', 'nope', false, 0]) {
    assert.equal(booleanParam(true).parse(v), false, `selhalo pro ${JSON.stringify(v)}`);
  }
});

test('chybějící hodnota bere výchozí', () => {
  assert.equal(booleanParam(false).parse(undefined), false);
  assert.equal(booleanParam(true).parse(undefined), true);
  assert.equal(booleanParam(true).parse(''), true);
});

test('povinná varianta chybějící hodnotu odmítne', () => {
  assert.throws(() => booleanParamRequired().parse(undefined));
});
