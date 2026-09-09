// Rozpoctova pojistka na generatoru receptu + sazby v odhadu ceny.
//
// PROC TENHLE TEST EXISTUJE. 9. 9. 2026 dosel kredit u OpenAI a s nim spadl
// TED i generovani planu. Pojistka `assertOpenAIDailyBudget()` existovala, ale
// hlidala jen `runAgent()`; generator receptu — zdaleka nejvetsi polozka —
// jel mimo ni. Regrese by se projevila az dalsim vycerpanym kreditem, tedy
// mimo testy a az u uzivatelu.
//
// `RECIPE_GEN_MAX_PER_DAY` tohle nenahrazuje: pocita KUSY receptu, ne penize.
// Beh, ve kterem model vrati davku a nic neprojde validaci, stoji stejne jako
// uspesny, ale strop nesnizi — presne tenhle pripad tvoril 55 % utraty.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runRecipeGenerator } from '../recipeGeneratorRun.js';
import { estimateOpenAICostUSD } from '../aiOps.js';

/** Klient, ktery jen sbira zapsane radky — na nic jineho beh nesmi sahnout. */
function fakeClient() {
  const zapsano = [];
  return {
    zapsano,
    from(tabulka) {
      return {
        insert(radky) {
          zapsano.push({ tabulka, radky });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

test('vycerpany denni rozpocet zastavi generator drive, nez zavola model', async () => {
  const client = fakeClient();
  const vysledek = await runRecipeGenerator({
    client,
    // Kdyby se pojistka minula, beh by sahnul na `openai` a spadl —
    // zamerne tu zadny neni.
    zkontrolujRozpocet: async () => ({ allowed: false, spent: 3.2, budget: 3 }),
  });

  assert.equal(vysledek.skipped, true);
  assert.equal(vysledek.reason, 'denni_rozpocet_vycerpan');
  assert.equal(vysledek.zapsano, 0);
  assert.equal(vysledek.utraceno_usd, 3.2);
  assert.equal(vysledek.rozpocet_usd, 3);
});

test('preskoceny beh se PRESTO zapise do ai_runs, at je duvod videt', async () => {
  const client = fakeClient();
  await runRecipeGenerator({
    client,
    zkontrolujRozpocet: async () => ({ allowed: false, spent: 5, budget: 3 }),
  });

  const zaznam = client.zapsano.find((z) => z.tabulka === 'ai_runs');
  assert.ok(zaznam, 'beh bez zaznamu je nerozeznatelny od behu, ktery nenabehl');
  assert.equal(zaznam.radky.result.skipped, true);
  assert.equal(zaznam.radky.result.reason, 'denni_rozpocet_vycerpan');
  assert.equal(zaznam.radky.cost_usd, 0);
});

test('suchy beh se rozpoctu nepta — nic neplati', async () => {
  let zeptal = false;
  // Suchy beh pokracuje dal do databaze, kterou tenhle fake klient neumi.
  // Zajima nas jen, ze se cestou NEZEPTAL na rozpocet; kde presne spadne
  // potom, je pro tenhle test jedno.
  await runRecipeGenerator({
    dryRun: true,
    client: fakeClient(),
    zkontrolujRozpocet: async () => {
      zeptal = true;
      return { allowed: false, spent: 9, budget: 3 };
    },
  }).catch(() => {});

  assert.equal(zeptal, false);
});

test('odhad ceny pouziva sazby gpt-4o, ne dvojnasobek', () => {
  // gpt-4o: 2,50 USD za milion vstupnich, 10 USD za milion vystupnich.
  // Drive tu bylo 5/15, takze odhad nadhodnocoval utratu a pojistka by
  // sepla pri polovine skutecne castky.
  const cena = estimateOpenAICostUSD('gpt-4o', 1_000_000, 1_000_000);
  assert.equal(Math.round(cena * 100) / 100, 12.5);
});

test('odhad ceny zna levnejsi sazby mini modelu', () => {
  const cena = estimateOpenAICostUSD('gpt-4o-mini', 1_000_000, 1_000_000);
  assert.equal(Math.round(cena * 100) / 100, 0.75);
});
