/**
 * FILTR GRAFU VÁHY MUSÍ OPRAVDU FILTROVAT.
 *
 * Do 23. 9. 2026 stálo v App.tsx:
 *
 *     setWeightRecords({ '1M': vazeni, '3M': vazeni, '6M': vazeni, '1R': vazeni });
 *
 * Všechny čtyři klíče držely TOTOŽNÉ pole, takže přepínač překresloval
 * pořád stejný graf. Nikdo si toho nevšiml, protože osa nese jen dny
 * a měsíce — „1M" a „1R" vypadaly na první pohled stejně.
 *
 * První test je přesně na tuhle chybu: kdyby se řady zase začaly plnit
 * jedním polem, musí spadnout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { WeightRecord } from '../types.ts';
import {
  FILTRY_VAHY,
  KLIC_VSE,
  OKNO_DNI,
  POPISEK_FILTRU,
  sRozsirenouHistorii,
  sestavFiltryVahy,
  tydenniPrumery,
  vOkne,
} from './vahaFiltry.ts';

const DNES = new Date(2026, 8, 23); // 23. 9. 2026
const DEN_MS = 24 * 60 * 60 * 1000;

/** Vážení `predDny` dní před referenčním dneškem. */
function vazeni(predDny: number, kg: number): WeightRecord {
  const d = new Date(DNES.getTime() - predDny * DEN_MS);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const den = String(d.getDate()).padStart(2, '0');
  return { date: `${d.getFullYear()}-${m}-${den}`, weight: kg, fatPercent: 0, muscleKg: 0, bmi: 0 };
}

/** Historie přes celý rok — po jednom vážení v každém pásmu. */
const HISTORIE: WeightRecord[] = [
  vazeni(300, 95),
  vazeni(150, 92),
  vazeni(80, 90),
  vazeni(45, 88),
  vazeni(20, 86),
  vazeni(5, 85),
  vazeni(1, 84.6),
].sort((a, b) => a.date.localeCompare(b.date));

test('každý filtr vrací JINÁ data — přesně ten bug, co se opravoval', () => {
  const rady = sestavFiltryVahy(HISTORIE, DNES);

  // Vážení jsou 300, 150, 80, 45, 20, 5 a 1 den zpátky. Do okna spadne:
  // D(7) → 5,1 | T(84) → 80,45,20,5,1 (pět různých týdnů) | 1M(30) → 20,5,1
  // | 3M(90) → 80,45,20,5,1 | 6M(180) → 150,80,45,20,5,1 | 1R(365) → vše.
  const delky = FILTRY_VAHY.map((f) => rady[f].length);
  assert.deepEqual(delky, [2, 5, 3, 5, 6, 7], 'okna nefiltrují podle svého rozsahu');

  // Žádné dvě řady nesmí být totéž pole ani stejný obsah.
  for (let i = 0; i < FILTRY_VAHY.length; i++) {
    for (let j = i + 1; j < FILTRY_VAHY.length; j++) {
      const a = rady[FILTRY_VAHY[i]];
      const b = rady[FILTRY_VAHY[j]];
      assert.notEqual(a, b, `${FILTRY_VAHY[i]} a ${FILTRY_VAHY[j]} sdílí tentýž objekt`);
      assert.notDeepEqual(
        a,
        b,
        `${FILTRY_VAHY[i]} a ${FILTRY_VAHY[j]} vracejí identická data — filtr nefiltruje`,
      );
    }
  }
});

test('okno se počítá od dneška, ne od posledního vážení', () => {
  // Kdo se naposled vážil před půl rokem, má „posledních 30 dní" prázdných.
  // Je to platný výsledek, ne chyba — posouvat okno k poslednímu záznamu by
  // znamenalo vydávat půlroční měření za tenhle měsíc.
  const stara = [vazeni(200, 99)];
  const rady = sestavFiltryVahy(stara, DNES);

  assert.equal(rady['1M'].length, 0);
  assert.equal(rady['1R'].length, 1);
});

test('celá historie má vlastní klíč — hero se neptá okna', () => {
  const rady = sestavFiltryVahy(HISTORIE, DNES);

  assert.equal(rady[KLIC_VSE].length, HISTORIE.length);
  // I vážení starší než rok tu zůstává: „poslední vážení" musí existovat
  // i pro účet, který se rok nevážil.
  const prastare = sestavFiltryVahy([vazeni(400, 100)], DNES);
  assert.equal(prastare[KLIC_VSE].length, 1);
  assert.equal(prastare['1R'].length, 0);
});

test('vOkne bere krajní den včetně, o den dřív už ne', () => {
  const zaznamy = [vazeni(OKNO_DNI.D - 1, 80), vazeni(OKNO_DNI.D, 81)];
  const v = vOkne(zaznamy, OKNO_DNI.D, DNES);

  assert.equal(v.length, 1, 'okno „posledních 7 dní" musí být 7 dní, ne 8');
  assert.equal(v[0].weight, 80);
});

test('týdenní řada je průměr za týden, ne poslední vážení v něm', () => {
  // Tři vážení v jednom týdnu (po–st) se musí slít do jednoho bodu.
  const pondeli = new Date(2026, 8, 21); // 21. 9. 2026 je pondělí
  const den = (posun: number) => {
    const d = new Date(pondeli.getTime() + posun * DEN_MS);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
  };
  const tyden: WeightRecord[] = [
    { date: den(0), weight: 80, fatPercent: 0, muscleKg: 0, bmi: 0 },
    { date: den(1), weight: 82, fatPercent: 0, muscleKg: 0, bmi: 0 },
    { date: den(2), weight: 81, fatPercent: 0, muscleKg: 0, bmi: 0 },
  ];

  const prumery = tydenniPrumery(tyden);
  assert.equal(prumery.length, 1, 'týden má být jeden bod');
  assert.equal(prumery[0].weight, 81, 'průměr 80/82/81 je 81, ne poslední hodnota');
  assert.equal(prumery[0].date, den(0), 'bod se datuje na pondělí toho týdne');
});

test('týdny se nesčítají přes hranici pondělí', () => {
  const nedele = { date: '2026-09-20', weight: 90, fatPercent: 0, muscleKg: 0, bmi: 0 };
  const pondeli = { date: '2026-09-21', weight: 80, fatPercent: 0, muscleKg: 0, bmi: 0 };

  const prumery = tydenniPrumery([nedele, pondeli]);
  assert.equal(prumery.length, 2, 'neděle patří do předchozího týdne');
  assert.deepEqual(prumery.map((p) => p.weight), [90, 80]);
});

test('nové vážení přepočítá řady, nelepí se zvlášť do každé', () => {
  const puvodni = sestavFiltryVahy(HISTORIE, DNES);
  const dnesniVazeni = vazeni(0, 84.2);
  const po = sRozsirenouHistorii(puvodni, dnesniVazeni, DNES);

  assert.equal(po[KLIC_VSE].length, HISTORIE.length + 1);
  assert.equal(po.D[po.D.length - 1].weight, 84.2, 'nové vážení chybí v denní řadě');
  // Týdenní řada nesmí dostat samotný záznam — musí se přepočítat průměr.
  assert.ok(po.T.length >= 1);
  assert.ok(
    po.T.every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date)),
    'týdenní body musí mít ISO datum, ne popisek typu „09.2026"',
  );
});

test('druhé vážení téhož dne původní přepíše, nepřidá bod', () => {
  const rady = sestavFiltryVahy([vazeni(0, 85)], DNES);
  const po = sRozsirenouHistorii(rady, vazeni(0, 84.1), DNES);

  assert.equal(po[KLIC_VSE].length, 1, 'jeden den = jeden bod v grafu');
  assert.equal(po[KLIC_VSE][0].weight, 84.1);
});

test('App.tsx plní řady přes sestavFiltryVahy, ne jedním polem', () => {
  const KOREN = path.join(import.meta.dirname, '..', '..');
  const app = fs.readFileSync(path.join(KOREN, 'src', 'App.tsx'), 'utf8');

  assert.match(app, /setWeightRecords\(sestavFiltryVahy\(vazeni\)\)/);
  assert.doesNotMatch(
    app,
    /'1M':\s*vazeni/,
    'řady se zase plní jedním polem — filtr přestal filtrovat',
  );
  // „Poslední vážení" se nesmí brát z okna.
  assert.match(app, /weightRecords\[KLIC_VSE\]/);
});

test('graf nabízí Den i Týden a popisky jsou srozumitelné', () => {
  assert.deepEqual([...FILTRY_VAHY], ['D', 'T', '1M', '3M', '6M', '1R']);
  assert.equal(POPISEK_FILTRU.D, 'Den');
  assert.equal(POPISEK_FILTRU.T, 'Týden');

  const KOREN = path.join(import.meta.dirname, '..', '..');
  const graf = fs.readFileSync(path.join(KOREN, 'src', 'components', 'WeightChart.tsx'), 'utf8');
  assert.match(graf, /FILTRY_VAHY\.map/, 'tlačítka se musí brát ze sdíleného seznamu');
  assert.match(graf, /POPISEK_FILTRU\[filter\]/, '„D" a „T" samy o sobě nic neříkají');
});
