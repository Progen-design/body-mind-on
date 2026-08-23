// Overuje, ze Sentry.ErrorBoundary ukaze fallback <Havarie /> i kdyz Sentry
// nikdy nedostalo DSN a neinicializovalo se. Bez toho by pad komponenty u
// uzivatele skoncil bilou obrazovkou presne tam, kde ma byt zachytna sit.
//
// Klicove misto v SDK: setState({ error, componentStack, eventId }) je uvnitr
// withScope() az za captureReactException(). Kdyby kterekoli z nich bez klienta
// hodilo, componentDidCatch spadne a fallback se nenastavi.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as Sentry from '@sentry/react';

// Zadne Sentry.init() — presne stav produkce bez nastaveneho DSN.

test('bez inicializace Sentry nema klienta', () => {
  assert.equal(Sentry.getClient(), undefined, 'test by jinak meril inicializovane Sentry');
});

test('componentDidCatch bez DSN nespadne a nastaví stav chyby', () => {
  const fallback = React.createElement('div', null, 'Havarie');
  const boundary = new Sentry.ErrorBoundary({ fallback } as never);

  const zapsano: Record<string, unknown>[] = [];
  // React tady nebezi, setState nahrazujeme rucne. Stav prepisujeme novym
  // objektem — SDK ma INITIAL_STATE sdilene na urovni modulu a mutace by
  // protekla do dalsiho testu.
  (boundary as unknown as { setState: (s: object) => void; state: object }).setState = (
    s: object
  ) => {
    zapsano.push(s as Record<string, unknown>);
    (boundary as unknown as { state: object }).state = { ...boundary.state, ...s };
  };

  assert.doesNotThrow(() => {
    boundary.componentDidCatch(new Error('pad v komponente'), {
      componentStack: '\n    at WorkoutSection'
    } as never);
  }, 'componentDidCatch bez inicializovaneho Sentry hodil vyjimku');

  const stav = zapsano.at(-1);
  assert.ok(stav, 'setState nebyl zavolan — fallback by se nikdy nezobrazil');
  assert.ok(stav.componentStack, 'componentStack zustal prazdny, render() by vratil children');
  assert.equal((stav.error as Error).message, 'pad v komponente');
});

test('render() po chybě vrátí fallback, ne children', () => {
  const fallback = React.createElement('div', null, 'Havarie');
  const children = React.createElement('div', null, 'App');
  const boundary = new Sentry.ErrorBoundary({ fallback, children } as never);

  // Pred chybou se vykresluji children.
  assert.equal(boundary.render(), children);

  // Po chybe (stav nastaveny stejne jako v componentDidCatch) fallback.
  (boundary as unknown as { state: object }).state = {
    error: new Error('pad'),
    componentStack: '\n    at WorkoutSection',
    eventId: null
  };

  assert.equal(boundary.render(), fallback, 'render() nevratil fallback');
});
