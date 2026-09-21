import test from 'node:test';
import assert from 'node:assert/strict';
import { serieDni, tydenSouhrn, pripravenoRadky, grafVahy, bodyNaPolyline } from './tvojeCesta.ts';

const TED = new Date('2026-09-21T10:00:00Z'); // pondělí, 12:00 v Praze

test('série: dnešek a dva dny před ním = 3', () => {
  assert.equal(serieDni(['2026-09-21T08:00:00Z', '2026-09-20T18:00:00Z', '2026-09-19T09:00:00Z'], TED), 3);
});

test('série: dnešek bez záznamu sérii nepřerušuje, počítá se od včerejška', () => {
  assert.equal(serieDni(['2026-09-20T18:00:00Z', '2026-09-19T09:00:00Z'], TED), 2);
});

test('série: díra ve dni ji ukončí', () => {
  assert.equal(serieDni(['2026-09-21T08:00:00Z', '2026-09-19T09:00:00Z'], TED), 1);
});

test('série: více záznamů v jednom dni je jedna', () => {
  assert.equal(serieDni(['2026-09-21T06:00:00Z', '2026-09-21T09:00:00Z'], TED), 1);
});

test('série: bez dat nebo se starými daty je 0', () => {
  assert.equal(serieDni([], TED), 0);
  assert.equal(serieDni(['2026-09-10T09:00:00Z'], TED), 0);
  assert.equal(serieDni([null, undefined, 'nesmysl'], TED), 0);
});

test('série: den se počítá v Praze — 23:30 UTC už je další den', () => {
  // 20. 9. 23:30 UTC = 21. 9. 01:30 Praha → počítá se jako dnešek
  assert.equal(serieDni(['2026-09-20T23:30:00Z'], TED), 1);
});

test('týden: odcvičeno a zapsáno, dny volna se nepočítají', () => {
  const t = tydenSouhrn(
    [
      { maTrenink: true, isCompleted: true, exercises: [1] },
      { maTrenink: true, isCompleted: false, exercises: [1] },
      { maTrenink: false, isCompleted: false, exercises: [] },
      { isCompleted: false, exercises: [] },
    ],
    [{ meals: [{ completed: true }, { completed: false }] }, { meals: [{ completed: true }] }]
  );
  assert.deepEqual(t, { treninkuHotovo: 1, treninkuCelkem: 2, jidelZapsano: 2, jidelCelkem: 3 });
});

test('připraveno: jen to, co existuje, se správným skloňováním', () => {
  assert.deepEqual(
    pripravenoRadky({ jidelNaTyden: 35, treninkuNaTyden: 3, polozekNakupu: 42, tedDostupny: true }),
    ['35 jídel na tento týden', '3 tréninky', 'nákupní seznam 42 položek', 'AI trenér TED']
  );
  assert.deepEqual(
    pripravenoRadky({ jidelNaTyden: 1, treninkuNaTyden: 1, polozekNakupu: 1, tedDostupny: false }),
    ['1 jídlo na tento týden', '1 trénink', 'nákupní seznam 1 položka']
  );
  assert.deepEqual(pripravenoRadky({ jidelNaTyden: 0, treninkuNaTyden: 0, polozekNakupu: 0, tedDostupny: false }), []);
});

test('graf váhy: méně než dva záznamy v okně = žádný graf', () => {
  assert.equal(grafVahy([{ date: '2026-09-20', weight: 80 }], 75, TED), null);
  assert.equal(grafVahy([{ date: '2026-06-01', weight: 80 }, { date: '2026-06-02', weight: 79 }], 75, TED), null);
});

test('graf váhy: starší záznamy mimo okno 30 dní se nekreslí', () => {
  const g = grafVahy(
    [
      { date: '2026-06-01', weight: 90 },
      { date: '2026-09-01', weight: 82 },
      { date: '2026-09-20', weight: 80 },
    ],
    75,
    TED
  );
  assert.ok(g);
  assert.equal(g.body.length, 2);
});

test('graf váhy: nižší váha je níž na plátně a cíl 75 kg leží pod 80 kg', () => {
  const g = grafVahy([{ date: '2026-09-01', weight: 82 }, { date: '2026-09-20', weight: 80 }], 75, TED);
  assert.ok(g);
  assert.ok(g.body[1].y > g.body[0].y, 'klesající váha klesá i na plátně (y roste dolů)');
  assert.ok(g.cilY != null && g.cilY > g.body[1].y, 'cíl 75 kg leží pod 80 kg');
  assert.ok(g.body[0].x < g.body[1].x);
});

test('graf váhy: všechny body leží uvnitř plátna', () => {
  const g = grafVahy(
    [{ date: '2026-09-01', weight: 82 }, { date: '2026-09-10', weight: 80.5 }, { date: '2026-09-20', weight: 81 }],
    70,
    TED,
    300,
    80
  );
  assert.ok(g);
  for (const b of g.body) {
    assert.ok(b.x >= 0 && b.x <= 300 && b.y >= 0 && b.y <= 80, JSON.stringify(b));
  }
  assert.ok(g.cilY != null && g.cilY >= 0 && g.cilY <= 80);
});

test('graf váhy: stejná váha nedělí nulou', () => {
  const g = grafVahy([{ date: '2026-09-01', weight: 80 }, { date: '2026-09-20', weight: 80 }], null, TED);
  assert.ok(g);
  assert.ok(Number.isFinite(g.body[0].y));
  assert.equal(g.cilY, null);
});

test('bodyNaPolyline', () => {
  assert.equal(bodyNaPolyline([{ x: 1, y: 2 }, { x: 3.14159, y: 4 }]), '1,2 3.1,4');
});
