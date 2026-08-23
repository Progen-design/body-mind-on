// UZIVATEL BEZ DAT NESMI SHODIT STRANKU.
//
// Do Etapy 3.4 drzel `latestRecord` nad vodou jen seed: sedm vymyslenych
// vazeni v initialWeightRecords. Jakmile se vymyslena data odstranila, vratil
// by monthRecords[monthRecords.length - 1] undefined a latestRecord.weight by
// shodil profil — presne jako zalozka "Treninkovy plan" v Etape 1.
//
// Tyhle testy hlidaji tri realne stavy: novy ucet bez vazeni, ucet s jednim
// vazenim a ucet bez Withings i Apple Health.
import test from 'node:test';
import assert from 'node:assert/strict';

import { naVazeni, naTelesneSlozeni, naProfil, naNastaveniProfilu } from './adaptery.ts';
import { maZdravotniData, naBiometrii } from './adapteryZdravi.ts';
import { PRAZDNA_BIOMETRIE, PRAZDNY_PROFIL } from './initialData.ts';
import { datumCesky, dnesekPraha, hodnotaNeboPomlcka, popisekCile } from './adaptery.ts';

/** Totez, co dela App.tsx — posledni vazeni, nebo null. */
function posledniVazeni(vazeni: ReturnType<typeof naVazeni>) {
  return vazeni.length > 0 ? vazeni[vazeni.length - 1] : null;
}

// ---------------------------------------------------------------- bez vazeni

test('uživatel bez jediného vážení: latestRecord je null, ne pád', () => {
  const odpoved = { body_metrics: [], user: { id: 'u1', email: 'a@b.cz' } } as never;

  const vazeni = naVazeni(odpoved);
  assert.deepEqual(vazeni, []);

  const posledni = posledniVazeni(vazeni);
  assert.equal(posledni, null, 'bez vazeni musi byt null, ne undefined');

  // Presne to, co dela UI: cteni pres ?. a formatovani na "—".
  assert.equal(hodnotaNeboPomlcka(posledni?.weight, 'kg'), '—');
});

test('uživatel bez vážení nemá ani tělesné složení a karty se skryjí', () => {
  assert.equal(naTelesneSlozeni({} as never), null);
  assert.equal(naTelesneSlozeni({ body_composition: null } as never), null);
});

test('body_metrics bez weight_kg se nepočítá jako vážení', () => {
  // Radek z registrace muze mit vysku a vek, ale vahu ne.
  const odpoved = {
    body_metrics: [{ created_at: '2026-08-01T08:00:00Z', height_cm: 188, weight_kg: null }]
  } as never;

  assert.deepEqual(naVazeni(odpoved), []);
  assert.equal(posledniVazeni(naVazeni(odpoved)), null);
});

// ------------------------------------------------------------ jedno vazeni

test('uživatel s jedním vážením: latestRecord je to jediné', () => {
  const odpoved = {
    body_metrics: [{ created_at: '2026-08-02T08:00:00Z', weight_kg: 104.2, bmi: 29.5 }]
  } as never;

  const posledni = posledniVazeni(naVazeni(odpoved));

  assert.ok(posledni, 'jedno vazeni musi dat zaznam');
  assert.equal(posledni.weight, 104.2);
  assert.equal(hodnotaNeboPomlcka(posledni.weight, 'kg'), '104,2 kg');
});

test('jedno vážení nedopočítává tuk ani svaly', () => {
  // body_metrics ty sloupce nema; nula je "nemerime", ne namerena nula.
  // Karta slozeni se ridi body_composition, ne timhle.
  const posledni = posledniVazeni(
    naVazeni({ body_metrics: [{ created_at: '2026-08-02T08:00:00Z', weight_kg: 104.2 }] } as never)
  );

  assert.equal(posledni?.fatPercent, 0);
  assert.equal(posledni?.muscleKg, 0);
  // A UI takovou nulu nevykresli jako zmerenou hodnotu — slozeni ma vlastni zdroj.
  assert.equal(naTelesneSlozeni({} as never), null);
});

// ------------------------------------------------- bez Withings i Apple Health

test('uživatel bez Withings i Apple Health: žádná biometrie, žádný závěr', () => {
  assert.equal(maZdravotniData([]), false);
  assert.equal(maZdravotniData(undefined), false);

  // Radky bez jedine metriky se nepocitaji jako "mame data".
  assert.equal(maZdravotniData([{ local_date: '2026-08-22' }] as never), false);
});

test('prázdná biometrie nenese vymyšlené hodnoty ani rady', () => {
  // Driv tu byl kompletni seed: HRV 20,6 ms, spanek 7h 48m, 9 546 kroku
  // a rada o "centralni unave nervove soustavy", kterou videl kazdy uzivatel,
  // nez se data nacetla.
  assert.equal(PRAZDNA_BIOMETRIE.hrvMs, 0);
  assert.equal(PRAZDNA_BIOMETRIE.stepsToday, 0);
  // bloodOxygenPercent / deepSleepDuration / sleepEfficiencyPercent tu
  // byly jako konstantní nuly. Od 23. 8. 2026 v typu neexistují — nula
  // v poli, které nikdo nenaplní, je tvrzení bez dat.
  assert.ok(!('bloodOxygenPercent' in PRAZDNA_BIOMETRIE));
  assert.ok(!('sleepEfficiencyPercent' in PRAZDNA_BIOMETRIE));
  assert.ok(!('deepSleepDuration' in PRAZDNA_BIOMETRIE));
  assert.equal(PRAZDNA_BIOMETRIE.recoveryScore, 0);
  assert.equal(PRAZDNA_BIOMETRIE.recoveryAdvice, '');
  assert.equal(PRAZDNA_BIOMETRIE.sleepDuration, '');
  assert.equal(PRAZDNA_BIOMETRIE.lastSyncTime, '');
  assert.deepEqual(PRAZDNA_BIOMETRIE.hrvTrend, []);
  assert.deepEqual(PRAZDNA_BIOMETRIE.recentWorkouts, []);
});

test('naBiometrii bez dat nespadne a nevyrobí hodnoty', () => {
  const b = naBiometrii([], [], false, '', PRAZDNA_BIOMETRIE);

  assert.equal(b.appleWatchConnected, false);
  assert.equal(b.hrvMs, 0);
  assert.equal(b.stepsToday, 0);
  // Grafy se pri mene nez dvou bodech nekresli (BiometricsSection).
  assert.ok(b.hrvTrend.length < 2);
});

test('prázdný profil nenese cizí jméno ani plán', () => {
  // Driv tu bylo "Jan Novak / Prikopa" a "Premium Performance & Hypertrofy
  // Protocol", ktere na okamzik videl kazdy uzivatel.
  assert.equal(PRAZDNY_PROFIL.name, '');
  assert.equal(PRAZDNY_PROFIL.membershipPlan, '');
  assert.equal(PRAZDNY_PROFIL.avatarUrl, '');
});

// ------------------------------------------------------- vsechno prazdne najednou

test('úplně prázdná odpověď serveru projde všemi adaptéry bez pádu', () => {
  const prazdna = {} as never;

  assert.doesNotThrow(() => {
    naVazeni(prazdna);
    naTelesneSlozeni(prazdna);
    naProfil(prazdna);
    naNastaveniProfilu(prazdna);
  });

  const profil = naProfil(prazdna);
  assert.equal(typeof profil.name, 'string', 'naProfil musi vratit retezec, ne undefined');

  const nastaveni = naNastaveniProfilu(prazdna);
  assert.deepEqual(nastaveni.workout_days, []);
  assert.deepEqual(nastaveni.selected_habits, []);
});

test('formátovač na chybějící hodnoty vrací "—" pro všechny metriky', () => {
  for (const jednotka of ['kg', '%', 'ms', 'bpm', '']) {
    assert.equal(hodnotaNeboPomlcka(null, jednotka), '—');
    assert.equal(hodnotaNeboPomlcka(undefined, jednotka), '—');
  }
});

// ------------------------------------------------------------------ cíle

test('bez cíle zůstane pod dlaždicí jen jednotka, žádné vymyšlené číslo', () => {
  // Driv tu bylo natvrdo "kcal (cil 1 500)" a "min (cil 60,0)" vedle poli
  // activeEnergyTargetKcal a exerciseMinutesTarget, ktera se o par radku vys
  // ve stejnem souboru spravne pouzivala pro graf.
  assert.equal(popisekCile('kcal', null), 'kcal');
  assert.equal(popisekCile('kcal', undefined), 'kcal');
  assert.equal(popisekCile('min', 0), 'min');
  assert.equal(popisekCile('', 0), '');
});

test('cíl se vypíše, jen když ho server opravdu pošle', () => {
  // Tisice deli cs-CZ pevnou mezerou (U+00A0), ne obycejnou — proto  .
  assert.equal(popisekCile('kcal', 1500), 'kcal (cíl 1 500)');
  assert.equal(popisekCile('min', 60), 'min (cíl 60)');
  assert.equal(popisekCile('', 10000), 'cíl 10 000');
});

test('nula se nevydává za cíl a záporný cíl neprojde', () => {
  // Nula znamena "cil nemame", ne "cil je nula".
  assert.equal(popisekCile('kcal', 0), 'kcal');
  assert.equal(popisekCile('kcal', -100), 'kcal');
  assert.equal(popisekCile('kcal', Number.NaN), 'kcal');
});

// ------------------------------------------------------------------ datum

test('datum exportu se bere z dneška, ne z natvrdo psaného řetězce', () => {
  // V hlavicce PDF svitilo "Datum: 20. 8. 2026" bez ohledu na to, kdy
  // uzivatel export otevrel.
  assert.equal(datumCesky('2026-08-20'), '20. 8. 2026');
  assert.equal(datumCesky('2026-01-05'), '5. 1. 2026');
  assert.equal(datumCesky('2026-12-31T23:00:00Z'), '31. 12. 2026');
});

test('chybějící datum je "—", ne dnešek a ne prázdno', () => {
  assert.equal(datumCesky(null), '—');
  assert.equal(datumCesky(undefined), '—');
  assert.equal(datumCesky(''), '—');
  assert.equal(datumCesky('nesmysl'), '—');
});

test('dnešek pro export je pražský den, ne UTC', () => {
  // new Date(iso) by ISO retezec vzal jako pulnoc UTC a v Praze z nej udelal
  // predchozi den — proto se datumCesky sklada ze slozek retezce.
  assert.match(dnesekPraha(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(datumCesky(dnesekPraha()), datumCesky(dnesekPraha()));
});
