/**
 * lib/exerciseMediaBackfill.js persistWgerMedia()
 *
 * Zápis wger média zpátky do exercise_asset_registry — doplněk, ne náhrada
 * (viz komentář u funkce). Volají ji lib/services/exerciseProviderRegistry.js
 * resolveExercise() i scripts/doplneni-medii-cviku.mjs. Testuje se přes
 * falešný Supabase klient, který jen zaznamená, jaký patch a na kterém
 * canonical_key by se zapsal — žádné síťové ani DB volání.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persistWgerMedia } from '../exerciseMediaBackfill.js';

/**
 * `selhat` napodobí PŘENOSOVOU chybu (síť, timeout) — jediný případ, kdy
 * Supabase klient opravdu vyhodí výjimku. `odmitnout` napodobí chybu
 * DATABÁZE (RLS, chybný sloupec, constraint): klient nevyhazuje nic,
 * vrátí { error }. Druhý případ je ten častější a bez explicitní kontroly
 * `error` by zmizel beze stopy — proto se testuje zvlášť.
 */
function falesnyKlient({ selhat = false, odmitnout = false, kolizeMedia = false, kontrolaSelze = false } = {}) {
  const volani = [];
  const kontroly = [];
  const client = {
    from(tabulka) {
      return {
        // Kontrola unikátnosti snímku (mediumUzPatriJinemuCviku) — bez ní
        // by wger mohl dát tentýž obrázek víc cvikům, což se v produkci
        // stalo 13 cvikům najednou.
        select() {
          return {
            or(filtr) {
              kontroly.push({ tabulka, filtr });
              return {
                neq() {
                  return {
                    limit() {
                      if (kontrolaSelze) return Promise.resolve({ data: null, error: { message: 'permission denied' } });
                      return Promise.resolve({ data: kolizeMedia ? [{ canonical_key: 'jiny_cvik' }] : [], error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update(patch) {
          volani.push({ tabulka, patch });
          return {
            eq(sloupec, hodnota) {
              volani[volani.length - 1].eq = { sloupec, hodnota };
              if (selhat) return Promise.reject(new Error('DB je nedostupná'));
              if (odmitnout) return Promise.resolve({ data: null, error: { message: 'new row violates row-level security policy' } });
              return Promise.resolve({ data: [{ id: 1 }], error: null });
            },
          };
        },
      };
    },
  };
  return { client, volani, kontroly };
}

test('zapíše wger_exercise_image_url a wger_exercise_id, nikdy image_url ani gif_url', async () => {
  const { client, volani } = falesnyKlient();
  await persistWgerMedia(client, 'squat', {
    image_url: 'https://wger.de/media/exercise-images/1/squat.jpg',
    wger_exercise_id: 345,
  });

  assert.equal(volani.length, 1);
  assert.equal(volani[0].tabulka, 'exercise_asset_registry');
  assert.deepEqual(volani[0].patch, {
    wger_exercise_image_url: 'https://wger.de/media/exercise-images/1/squat.jpg',
    wger_exercise_id: 345,
  });
  assert.ok(!('image_url' in volani[0].patch), 'patch nesmí obsahovat image_url');
  assert.ok(!('gif_url' in volani[0].patch), 'patch nesmí obsahovat gif_url');
  assert.deepEqual(volani[0].eq, { sloupec: 'canonical_key', hodnota: 'squat' });
});

test('nikdy nepřepíše existující image_url/gif_url — UPDATE se na ně vůbec neptá', async () => {
  // Existující hodnoty ani nejsou vstupem funkce — jediný způsob, jak by je
  // mohla přepsat, je zahrnout je do patche. Test dokazuje, že to nedělá,
  // ať už DB řádek v image_url/gif_url cokoli má.
  const { client, volani } = falesnyKlient();
  await persistWgerMedia(client, 'bench_press', { image_url: 'https://wger.de/x.jpg' });
  const klice = Object.keys(volani[0].patch);
  assert.deepEqual(klice, ['wger_exercise_image_url']);
});

test('prázdná odpověď z wgeru (bez image_url i gif_url) nezapíše prázdný řetězec — UPDATE se vůbec nezavolá', async () => {
  const { client, volani } = falesnyKlient();
  await persistWgerMedia(client, 'squat', { image_url: null, gif_url: '' });
  assert.equal(volani.length, 0);
});

test('bez canonical_key se nezapisuje', async () => {
  const { client, volani } = falesnyKlient();
  await persistWgerMedia(client, null, { image_url: 'https://wger.de/x.jpg' });
  assert.equal(volani.length, 0);
});

test('gif_url z wgeru se použije, jen když image_url chybí', async () => {
  const { client, volani } = falesnyKlient();
  await persistWgerMedia(client, 'plank', { image_url: null, gif_url: 'https://wger.de/plank.gif' });
  assert.equal(volani[0].patch.wger_exercise_image_url, 'https://wger.de/plank.gif');
});

test('neplatné wger_exercise_id (NaN, 0, prázdné) se do patche nepřidá', async () => {
  const { client, volani } = falesnyKlient();
  await persistWgerMedia(client, 'squat', { image_url: 'https://wger.de/x.jpg', wger_exercise_id: 'abc' });
  assert.ok(!('wger_exercise_id' in volani[0].patch));
});

test('selhání zápisu se zaloguje, ale nepropadne volajícímu (sestavení plánu nespadne)', async () => {
  const { client } = falesnyKlient({ selhat: true });
  const puvodniError = console.error;
  const zalogovano = [];
  console.error = (...args) => zalogovano.push(args);
  try {
    await assert.doesNotReject(() =>
      persistWgerMedia(client, 'squat', { image_url: 'https://wger.de/x.jpg' })
    );
  } finally {
    console.error = puvodniError;
  }
  assert.ok(zalogovano.length > 0, 'chyba měla být zalogována');
});

test('odmítnutí databází ({ error }, bez výjimky) se zaloguje a nepropadne volajícímu', async () => {
  // Supabase klient nevyhazuje výjimku, když UPDATE odmítne databáze —
  // vrátí { error }. Bez explicitní kontroly `error` by takové selhání
  // zmizelo úplně beze stopy a my bychom si mysleli, že se médium zapsalo.
  const { client, volani } = falesnyKlient({ odmitnout: true });
  const puvodni = console.error;
  const zalogovano = [];
  console.error = (...args) => zalogovano.push(args.join(' '));
  try {
    await assert.doesNotReject(() => persistWgerMedia(client, 'squat', {
      image_url: 'https://wger.de/media/exercise-images/1/squat.jpg',
    }));
  } finally {
    console.error = puvodni;
  }

  assert.equal(volani.length, 1, 'pokus o zápis proběhl');
  assert.equal(zalogovano.length, 1, 'odmítnutí databází se MUSÍ zalogovat, ne spolknout');
  assert.match(zalogovano[0], /row-level security/);
});

test('obrázek, který už patří jinému cviku, se nezapíše', async () => {
  const { client, volani } = falesnyKlient({ kolizeMedia: true });
  await persistWgerMedia(client, 'dumbbell_press', {
    image_url: 'https://wger.de/media/exercise-images/2534/sdileny.png',
    wger_exercise_id: 2534,
  });

  assert.equal(volani.length, 0, 'sdílený snímek se nesmí zapsat — uživatel by u cviku viděl cizí obrázek');
});

test('když kontrolu unikátnosti nelze provést, médium se raději nezapíše', async () => {
  const { client, volani } = falesnyKlient({ kontrolaSelze: true });
  await persistWgerMedia(client, 'squat', {
    image_url: 'https://wger.de/media/exercise-images/1/squat.jpg',
  });

  assert.equal(volani.length, 0, 'neověřený snímek se nezapisuje — žádný obrázek je lepší než cizí');
});

test('unikátní snímek projde kontrolou a zapíše se', async () => {
  const { client, volani, kontroly } = falesnyKlient();
  await persistWgerMedia(client, 'plank', {
    image_url: 'https://wger.de/media/exercise-images/9/plank.jpg',
  });

  assert.equal(kontroly.length, 1, 'kontrola unikátnosti musí proběhnout před zápisem');
  assert.equal(volani.length, 1);
  assert.equal(volani[0].patch.wger_exercise_image_url, 'https://wger.de/media/exercise-images/9/plank.jpg');
});
