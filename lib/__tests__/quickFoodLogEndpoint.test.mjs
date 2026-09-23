/**
 * POST /api/nutrition/quick-log — celý handler s atrapou OpenAI.
 *
 * `vytvorHandler()` bere závislosti zvenku: session, členství, rozpočet,
 * bucket, model a úložiště. Tady se všechny nahradí atrapou, takže test
 * projde celý tok (validace → limit → rozpočet → fotka → model → validace
 * odpovědi → zápis) bez sítě a bez Supabase.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { vytvorHandler } from '../../api/nutrition/quick-log/index.js';

function odpovedRes() {
  const res = { stav: null, telo: null };
  res.status = (s) => { res.stav = s; return res; };
  res.json = (t) => { res.telo = t; return res; };
  return res;
}

/** Atrapy všech závislostí. Každý test přepíše jen to, co zkouší. */
function sestav(prepis = {}) {
  const zaznam = { vlozeno: [], smazaneFotky: [], volaniModelu: [], chyby: [] };
  const uloziste = {
    pocetDnes: async () => 0,
    vloz: async (radek) => {
      zaznam.vlozeno.push(radek);
      return { data: { id: 'log-1', created_at: '2026-09-24T10:00:00Z', upraveno_uzivatelem: false, ...radek }, error: null };
    },
    seznam: async () => ({ data: [], error: null }),
    ...(prepis.uloziste || {}),
  };
  const handler = vytvorHandler({
    overUzivatele: async () => ({ user: { id: 'user-1' }, token: 't' }),
    clenstvi: async () => ({ allowed: true }),
    rozpocet: async () => ({ allowed: true }),
    nahrajFotku: async () => ({ cesta: 'user-1/foto.jpg', dataUrlProAI: 'data:image/jpeg;base64,AAAA' }),
    smazFotku: async (cesta) => { zaznam.smazaneFotky.push(cesta); },
    podepsaneUrl: async (cesty) => Object.fromEntries(cesty.map((c) => [c, `https://podepsano/${c}`])),
    volejModel: async (params, opts) => {
      zaznam.volaniModelu.push({ params, opts });
      return { choices: [{ message: { content: JSON.stringify({ popis: 'Rohlík se šunkou', kcal: 320, protein_g: 14, carbs_g: 40, fat_g: 11, confidence: 'high' }) } }] };
    },
    ...prepis,
    uloziste: () => uloziste,
  });
  return { handler, zaznam };
}

async function posli(handler, body) {
  const res = odpovedRes();
  const puvodni = console.error;
  console.error = () => {}; // [quick-log] logy k selhání se tu čekají
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res);
  } finally {
    console.error = puvodni;
  }
  return res;
}

test('úspěch z fotky: fotka se nahraje, model zavolá přes volejModel a zápis uloží', async () => {
  const { handler, zaznam } = sestav();
  const res = await posli(handler, { foto_base64: 'data:image/jpeg;base64,AAAA' });

  assert.equal(res.stav, 201);
  assert.equal(res.telo.zapis.kcal, 320);
  assert.equal(res.telo.zapis.foto_url, 'https://podepsano/user-1/foto.jpg');

  const [volani] = zaznam.volaniModelu;
  assert.equal(volani.params.purpose, 'quick_food_log');
  assert.equal(volani.params.model, 'gpt-4o-mini');
  assert.deepEqual(volani.params.response_format, { type: 'json_object' });
  assert.equal(volani.opts.timeout, 20_000);

  const [radek] = zaznam.vlozeno;
  assert.equal(radek.user_id, 'user-1', 'user_id ze session');
  assert.equal(radek.zdroj, 'foto');
  assert.equal(radek.photo_storage_path, 'user-1/foto.jpg');
  assert.equal(radek.popis, 'Rohlík se šunkou', 'u fotky popis od modelu');
  assert.equal(radek.ai_confidence, 'high');
  assert.match(radek.plan_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(zaznam.smazaneFotky, []);
});

test('úspěch z textu: popis zůstává od uživatele, fotka žádná', async () => {
  const { handler, zaznam } = sestav();
  const res = await posli(handler, { popis: 'dva rohlíky se šunkou', user_id: 'cizi-id' });

  assert.equal(res.stav, 201);
  assert.equal(zaznam.vlozeno[0].popis, 'dva rohlíky se šunkou');
  assert.equal(zaznam.vlozeno[0].photo_storage_path, null);
  assert.equal(zaznam.vlozeno[0].user_id, 'user-1', 'user_id z těla se ignoruje');
});

test('timeout modelu: 504, nic se neuloží a fotka se uklidí', async () => {
  const { handler, zaznam } = sestav({
    volejModel: async () => {
      const err = new Error('Request timed out.');
      err.name = 'APIConnectionTimeoutError';
      throw err;
    },
  });
  const res = await posli(handler, { foto_base64: 'data:image/jpeg;base64,AAAA' });

  assert.equal(res.stav, 504);
  assert.deepEqual(zaznam.vlozeno, []);
  assert.deepEqual(zaznam.smazaneFotky, ['user-1/foto.jpg']);
});

test('vyčerpaný rozpočet: 503 dřív, než se nahraje fotka nebo zavolá model', async () => {
  let nahrano = false;
  const { handler, zaznam } = sestav({
    rozpocet: async () => ({ allowed: false, spent: 3.2, budget: 3 }),
    nahrajFotku: async () => { nahrano = true; return { cesta: 'x', dataUrlProAI: 'x' }; },
  });
  const res = await posli(handler, { foto_base64: 'data:image/jpeg;base64,AAAA' });

  assert.equal(res.stav, 503);
  assert.equal(nahrano, false);
  assert.deepEqual(zaznam.volaniModelu, []);
  assert.deepEqual(zaznam.vlozeno, []);
});

test('rozpočet vyčerpaný až uvnitř volejModel (AIBudgetReachedError): taky 503, ne pád', async () => {
  const { handler, zaznam } = sestav({
    volejModel: async () => {
      const err = new Error('OpenAI daily budget reached');
      err.code = 'AI_BUDGET_REACHED';
      throw err;
    },
  });
  const res = await posli(handler, { popis: 'guláš' });
  assert.equal(res.stav, 503);
  assert.deepEqual(zaznam.vlozeno, []);
});

test('špatný JSON od modelu: 502 s lidskou hláškou, nic se neuloží', async () => {
  const { handler, zaznam } = sestav({
    volejModel: async () => ({ choices: [{ message: { content: 'Myslím, že je to asi 500 kcal.' } }] }),
  });
  const res = await posli(handler, { foto_base64: 'data:image/jpeg;base64,AAAA' });

  assert.equal(res.stav, 502);
  assert.equal(res.telo.error, 'Nepodařilo se rozpoznat jídlo, zkus to prosím znovu nebo zadej ručně.');
  assert.deepEqual(zaznam.vlozeno, []);
  assert.deepEqual(zaznam.smazaneFotky, ['user-1/foto.jpg']);
});

test('kcal mimo rozsah od modelu: 502, nesmysl se do DB nedostane', async () => {
  const { handler, zaznam } = sestav({
    volejModel: async () => ({ choices: [{ message: { content: '{"popis":"jablko","kcal":5000,"protein_g":1,"carbs_g":2,"fat_g":0}' } }] }),
  });
  const res = await posli(handler, { popis: 'jablko' });
  assert.equal(res.stav, 502);
  assert.deepEqual(zaznam.vlozeno, []);
});

test('denní limit: 20. zápis dnes → 429 bez volání modelu', async () => {
  const { handler, zaznam } = sestav({ uloziste: { pocetDnes: async () => 20 } });
  const res = await posli(handler, { popis: 'rohlík' });

  assert.equal(res.stav, 429);
  assert.match(res.telo.error, /limit 20/);
  assert.deepEqual(zaznam.volaniModelu, []);
});

test('fotka i popis naráz: 400', async () => {
  const { handler, zaznam } = sestav();
  const res = await posli(handler, { popis: 'rohlík', foto_base64: 'AAAA' });
  assert.equal(res.stav, 400);
  assert.deepEqual(zaznam.volaniModelu, []);
});

test('bez session: 401', async () => {
  const { handler } = sestav({ overUzivatele: async () => ({ error: 'Authorization required', status: 401 }) });
  const res = await posli(handler, { popis: 'rohlík' });
  assert.equal(res.stav, 401);
});
