/**
 * lib/translateQueueTurn.js — čtení/zápis "kdo byl na řadě naposled" pro
 * lib/translateQueueOrchestrator.js. Testuje se přes falešný Supabase
 * klient (žádné DB volání) — tabulka translate_queue_turn je zatím jen
 * návrh migrace (supabase/migrations/20260908110000_translate_queue_turn.sql,
 * neaplikovaná).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nactiPosledniFrontu, ulozPosledniFrontu, TRANSLATE_QUEUE_TURN_TABULKA } from '../translateQueueTurn.js';

function falesnyKlient({ radek = null, chybaCteni = null, chybaZapisu = null } = {}) {
  const volani = [];
  const client = {
    from(tabulka) {
      volani.push(tabulka);
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: radek, error: chybaCteni }),
              };
            },
          };
        },
        upsert: async (radek) => {
          volani.push({ upsert: radek });
          return { error: chybaZapisu };
        },
      };
    },
  };
  return { client, volani };
}

test('nactiPosledniFrontu: prázdná tabulka (žádný řádek) vrací null', async () => {
  const { client } = falesnyKlient({ radek: null });
  assert.equal(await nactiPosledniFrontu(client), null);
});

test('nactiPosledniFrontu: vrátí uloženou hodnotu', async () => {
  const { client } = falesnyKlient({ radek: { last_queue: 'exercises' } });
  assert.equal(await nactiPosledniFrontu(client), 'exercises');
});

test('nactiPosledniFrontu: neplatná hodnota v DB se nepropašuje dál, vrátí null', async () => {
  const { client } = falesnyKlient({ radek: { last_queue: 'neco_jineho' } });
  assert.equal(await nactiPosledniFrontu(client), null);
});

test('nactiPosledniFrontu: chyba čtení (např. tabulka ještě neexistuje) se propaguje jako výjimka', async () => {
  const { client } = falesnyKlient({ chybaCteni: { message: 'relation "translate_queue_turn" does not exist' } });
  await assert.rejects(() => nactiPosledniFrontu(client), /does not exist/);
});

test('ulozPosledniFrontu: zapíše správnou tabulku a hodnotu', async () => {
  const { client, volani } = falesnyKlient();
  await ulozPosledniFrontu(client, 'recipes');
  assert.equal(volani[0], TRANSLATE_QUEUE_TURN_TABULKA);
  assert.equal(volani[1].upsert.id, 1);
  assert.equal(volani[1].upsert.last_queue, 'recipes');
});

test('ulozPosledniFrontu: neplatnou hodnotu tiše ignoruje (žádný zápis)', async () => {
  const { client, volani } = falesnyKlient();
  await ulozPosledniFrontu(client, 'cokoli');
  assert.equal(volani.length, 0);
});

test('ulozPosledniFrontu: chyba zápisu se propaguje jako výjimka (volající — cron handler — ji odchytává sám)', async () => {
  const { client } = falesnyKlient({ chybaZapisu: { message: 'permission denied' } });
  await assert.rejects(() => ulozPosledniFrontu(client, 'recipes'), /permission denied/);
});
